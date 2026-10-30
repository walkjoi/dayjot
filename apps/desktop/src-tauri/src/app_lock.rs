//! The app lock: a password screen over every window.
//!
//! The gate lives here rather than in a webview because it has to span every
//! window and survive a webview reload. It hides the app; it encrypts nothing —
//! notes stay plain files on disk. The lock screen and the auto-lock choice are
//! frontend policy; this module owns whether the app is locked and the password
//! check.
//!
//! The password's Argon2 hash is a credential, so it lives in the OS keychain
//! ([`secrets`]). A marker file beside the settings records that one exists: a
//! launch must decide whether to start locked without reading the keychain,
//! which can park on a macOS prompt for any build whose signature doesn't match
//! the item's ACL. Deleting the marker is also the way back in from a forgotten
//! password (docs/privacy.md).
//!
//! Auto-lock runs on the wall clock here, not on webview timers: WebKit
//! throttles timers in hidden windows, and neither they nor `Instant` advance
//! while the Mac sleeps.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, SystemTime};

use argon2::password_hash::phc::PasswordHash;
use argon2::password_hash::{PasswordHasher, PasswordVerifier};
use argon2::Argon2;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::error::{AppError, AppResult};
use crate::secrets;

/// The keychain name the password hash is filed under.
const PASSWORD_SECRET: &str = "app-lock-password";

/// Event delivered to every window whenever the lock state changes.
const STATUS_EVENT: &str = "app-lock:changed";

/// How often the idle deadline is checked. Also the longest a window can stay
/// readable after the Mac wakes past its deadline, absent any input.
const IDLE_CHECK_INTERVAL: Duration = Duration::from_secs(5);

/// The lock state a window renders from.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub struct AppLockStatus {
    /// The lock screen is up.
    locked: bool,
    /// A password exists, so the app can lock at all.
    configured: bool,
}

#[derive(Debug)]
struct LockState {
    configured: bool,
    locked: bool,
    idle_timeout: Option<Duration>,
    last_activity: SystemTime,
}

impl LockState {
    /// Any password starts the app locked: otherwise quitting and reopening
    /// would walk straight past the lock.
    fn at_launch(configured: bool, now: SystemTime) -> Self {
        Self {
            configured,
            locked: configured,
            idle_timeout: None,
            last_activity: now,
        }
    }

    fn status(&self) -> AppLockStatus {
        AppLockStatus {
            locked: self.locked,
            configured: self.configured,
        }
    }

    /// Lock now; a no-op without a password, which nothing could unlock.
    fn lock(&mut self) {
        self.locked = self.configured;
    }

    fn unlock(&mut self, now: SystemTime) {
        self.locked = false;
        self.last_activity = now;
    }

    fn password_set(&mut self, now: SystemTime) {
        self.configured = true;
        self.last_activity = now;
    }

    fn password_cleared(&mut self) {
        self.configured = false;
        self.locked = false;
    }

    /// A clock stepped backwards reads as "not idle" rather than erroring.
    fn idle_expired(&self, now: SystemTime) -> bool {
        let Some(timeout) = self.idle_timeout else {
            return false;
        };
        self.configured
            && !self.locked
            && now
                .duration_since(self.last_activity)
                .is_ok_and(|idle| idle >= timeout)
    }

    /// Lock if the deadline has passed; true when this call locked.
    fn lock_if_idle(&mut self, now: SystemTime) -> bool {
        let expired = self.idle_expired(now);
        if expired {
            self.lock();
        }
        expired
    }

    /// Input restarts the idle clock — unless the deadline already passed. The
    /// first touch after a long gap (the Mac waking from sleep, say) must trip
    /// the lock, or whoever reaches the trackpad before the next idle check
    /// keeps the app open. True when this call locked.
    fn record_activity(&mut self, now: SystemTime) -> bool {
        if self.lock_if_idle(now) {
            return true;
        }
        self.last_activity = now;
        false
    }
}

/// App-wide lock state, managed by the Tauri app.
pub struct AppLock {
    state: Mutex<LockState>,
}

impl AppLock {
    /// Read the launch state from the marker file.
    pub fn load() -> Self {
        let configured = marker_path().is_ok_and(|path| marker_present(&path));
        Self {
            state: Mutex::new(LockState::at_launch(configured, SystemTime::now())),
        }
    }

    fn state(&self) -> MutexGuard<'_, LockState> {
        // The state stays valid whatever a panic interrupted; don't wedge the
        // lock screen.
        self.state
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
    }
}

fn marker_path() -> AppResult<PathBuf> {
    let base = dirs::config_dir().ok_or_else(|| AppError::io("no OS config dir"))?;
    Ok(base.join("dayjot-desktop").join("app-lock-enabled"))
}

/// An unreadable marker counts as present: a lock has to fail closed.
fn marker_present(path: &Path) -> bool {
    path.try_exists().unwrap_or(true)
}

fn write_marker(path: &Path) -> AppResult<()> {
    let dir = path
        .parent()
        .ok_or_else(|| AppError::io("app lock marker path has no parent directory"))?;
    fs::create_dir_all(dir)?;
    fs::write(path, b"")?;
    Ok(())
}

/// Removing a missing marker succeeds, so clearing a password is retry-safe.
fn remove_marker(path: &Path) -> AppResult<()> {
    match fs::remove_file(path) {
        Err(err) if err.kind() != std::io::ErrorKind::NotFound => Err(err.into()),
        _ => Ok(()),
    }
}

fn hash_password(password: &str) -> AppResult<String> {
    Argon2::default()
        .hash_password(password.as_bytes())
        .map(|hash| hash.to_string())
        .map_err(|err| AppError::io(err.to_string()))
}

fn verify_password(password: &str, stored: &str) -> AppResult<bool> {
    let hash = PasswordHash::new(stored).map_err(|err| AppError::parse(err.to_string()))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &hash)
        .is_ok())
}

enum PasswordCheck {
    Match,
    Mismatch,
    /// The keychain has no password: its item was deleted, or the marker
    /// arrived on a new Mac without it. Nothing can be checked, so nothing is
    /// locked.
    NoneStored,
}

/// Hashing is deliberately slow and the keychain read can park on a prompt, so
/// both stay off the main loop.
async fn check_password(candidate: String) -> AppResult<PasswordCheck> {
    let Some(stored) = secrets::secret_get(PASSWORD_SECRET.into()).await? else {
        return Ok(PasswordCheck::NoneStored);
    };
    let matches = secrets::run_blocking(move || verify_password(&candidate, &stored)).await?;
    Ok(if matches {
        PasswordCheck::Match
    } else {
        PasswordCheck::Mismatch
    })
}

/// Tell every window what changed. Locking also closes any open web inspector,
/// which would otherwise keep showing the page behind the lock screen.
fn publish<R: Runtime>(app: &AppHandle<R>, status: AppLockStatus) {
    if status.locked {
        for window in app.webview_windows().values() {
            window.close_devtools();
        }
    }
    if let Err(err) = app.emit(STATUS_EVENT, status) {
        tracing::error!(error = %err, "failed to publish the app lock state");
    }
}

fn clear_password<R: Runtime>(app: &AppHandle<R>) -> AppResult<()> {
    remove_marker(&marker_path()?)?;
    let status = {
        let lock = app.state::<AppLock>();
        let mut state = lock.state();
        state.password_cleared();
        state.status()
    };
    publish(app, status);
    Ok(())
}

/// Lock the app once its idle deadline passes. Call once at startup.
pub(crate) fn watch_idle<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(IDLE_CHECK_INTERVAL).await;
            let locked = {
                let lock = app.state::<AppLock>();
                let mut state = lock.state();
                state.lock_if_idle(SystemTime::now()).then(|| state.status())
            };
            if let Some(status) = locked {
                publish(&app, status);
            }
        }
    });
}

/// Command: the current lock state.
#[tauri::command]
pub fn app_lock_status<R: Runtime>(app: AppHandle<R>) -> AppLockStatus {
    app.state::<AppLock>().state().status()
}

/// Command: lock now. False when no password exists yet, so nothing locked.
#[tauri::command]
pub fn app_lock_lock<R: Runtime>(app: AppHandle<R>) -> bool {
    let status = {
        let lock = app.state::<AppLock>();
        let mut state = lock.state();
        state.lock();
        state.status()
    };
    publish(&app, status);
    status.locked
}

/// Command: unlock with `password`. False when it's wrong.
#[tauri::command]
pub async fn app_lock_unlock<R: Runtime>(app: AppHandle<R>, password: String) -> AppResult<bool> {
    match check_password(password).await? {
        PasswordCheck::Mismatch => return Ok(false),
        PasswordCheck::NoneStored => clear_password(&app)?,
        PasswordCheck::Match => {
            let status = {
                let lock = app.state::<AppLock>();
                let mut state = lock.state();
                state.unlock(SystemTime::now());
                state.status()
            };
            publish(&app, status);
        }
    }
    Ok(true)
}

/// Command: set or replace the password. `current` must match an existing
/// password; false when it doesn't, leaving everything unchanged.
#[tauri::command]
pub async fn app_lock_set_password<R: Runtime>(
    app: AppHandle<R>,
    current: Option<String>,
    next: String,
) -> AppResult<bool> {
    if next.is_empty() {
        return Err(AppError::parse("The password can't be empty."));
    }
    let configured = app.state::<AppLock>().state().configured;
    if configured {
        let current = current.unwrap_or_default();
        if matches!(check_password(current).await?, PasswordCheck::Mismatch) {
            return Ok(false);
        }
    }
    let hash = secrets::run_blocking(move || hash_password(&next)).await?;
    secrets::secret_set(PASSWORD_SECRET.into(), hash).await?;
    write_marker(&marker_path()?)?;
    let status = {
        let lock = app.state::<AppLock>();
        let mut state = lock.state();
        state.password_set(SystemTime::now());
        state.status()
    };
    publish(&app, status);
    Ok(true)
}

/// Command: remove the password, turning the lock off. False when `current`
/// doesn't match, leaving everything unchanged.
#[tauri::command]
pub async fn app_lock_remove_password<R: Runtime>(
    app: AppHandle<R>,
    current: String,
) -> AppResult<bool> {
    if matches!(check_password(current).await?, PasswordCheck::Mismatch) {
        return Ok(false);
    }
    clear_password(&app)?;
    secrets::secret_delete(PASSWORD_SECRET.into()).await?;
    Ok(true)
}

/// Command: how long the app may sit idle before it locks (`None` is never).
#[tauri::command]
pub fn app_lock_set_idle_timeout<R: Runtime>(app: AppHandle<R>, minutes: Option<u32>) {
    let timeout = minutes.map(|minutes| Duration::from_secs(u64::from(minutes) * 60));
    app.state::<AppLock>().state().idle_timeout = timeout;
}

/// Command: a window saw keyboard or pointer input.
#[tauri::command]
pub fn app_lock_record_activity<R: Runtime>(app: AppHandle<R>) {
    let locked = {
        let lock = app.state::<AppLock>();
        let mut state = lock.state();
        state.record_activity(SystemTime::now()).then(|| state.status())
    };
    if let Some(status) = locked {
        publish(&app, status);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    const MINUTE: Duration = Duration::from_secs(60);

    fn start() -> SystemTime {
        SystemTime::UNIX_EPOCH + Duration::from_secs(1_000_000)
    }

    /// Configured, unlocked, and on a 30-minute timer, with activity at `start()`.
    fn unlocked_on_timer() -> LockState {
        let mut state = LockState::at_launch(true, start());
        state.idle_timeout = Some(30 * MINUTE);
        state.unlock(start());
        state
    }

    #[test]
    fn a_password_starts_the_app_locked() {
        let with_password = LockState::at_launch(true, start()).status();
        assert!(with_password.locked && with_password.configured);

        let without = LockState::at_launch(false, start()).status();
        assert!(!without.locked && !without.configured);
    }

    #[test]
    fn locking_needs_a_password() {
        let mut state = LockState::at_launch(false, start());
        state.lock();
        assert!(!state.status().locked);

        state.password_set(start());
        state.lock();
        assert!(state.status().locked);
    }

    #[test]
    fn clearing_the_password_unlocks() {
        let mut state = LockState::at_launch(true, start());
        state.password_cleared();
        assert_eq!(
            state.status(),
            AppLockStatus {
                locked: false,
                configured: false
            }
        );
    }

    #[test]
    fn locks_once_the_deadline_passes() {
        let mut state = unlocked_on_timer();
        assert!(!state.lock_if_idle(start() + 29 * MINUTE));
        assert!(state.lock_if_idle(start() + 30 * MINUTE));
        assert!(state.status().locked);
    }

    #[test]
    fn a_tick_after_locking_reports_nothing_new() {
        let mut state = unlocked_on_timer();
        assert!(state.lock_if_idle(start() + 30 * MINUTE));
        assert!(!state.lock_if_idle(start() + 31 * MINUTE));
    }

    #[test]
    fn never_locks_without_a_timeout() {
        let mut state = unlocked_on_timer();
        state.idle_timeout = None;
        assert!(!state.lock_if_idle(start() + 10_000 * MINUTE));
    }

    #[test]
    fn never_locks_without_a_password() {
        let mut state = LockState::at_launch(false, start());
        state.idle_timeout = Some(MINUTE);
        assert!(!state.lock_if_idle(start() + 60 * MINUTE));
    }

    #[test]
    fn activity_restarts_the_clock() {
        let mut state = unlocked_on_timer();
        assert!(!state.record_activity(start() + 29 * MINUTE));
        assert!(!state.lock_if_idle(start() + 58 * MINUTE));
        assert!(state.lock_if_idle(start() + 59 * MINUTE));
    }

    #[test]
    fn the_first_touch_past_the_deadline_locks_instead_of_restarting() {
        // The Mac slept all night: the first input can beat the next idle tick.
        let mut state = unlocked_on_timer();
        assert!(state.record_activity(start() + 480 * MINUTE));
        assert!(state.status().locked);
    }

    #[test]
    fn unlocking_restarts_the_clock() {
        let mut state = unlocked_on_timer();
        state.lock();
        state.unlock(start() + 480 * MINUTE);
        assert!(!state.lock_if_idle(start() + 481 * MINUTE));
    }

    #[test]
    fn a_clock_stepped_backwards_does_not_lock() {
        let mut state = unlocked_on_timer();
        assert!(!state.lock_if_idle(start() - 60 * MINUTE));
    }

    #[test]
    fn verifies_the_password_it_hashed() {
        let hash = hash_password("晨间 notes").unwrap();
        assert!(verify_password("晨间 notes", &hash).unwrap());
        assert!(!verify_password("晨间 Notes", &hash).unwrap());
        assert!(!verify_password("", &hash).unwrap());
    }

    #[test]
    fn hashes_are_salted() {
        assert_ne!(hash_password("same").unwrap(), hash_password("same").unwrap());
    }

    #[test]
    fn a_corrupt_stored_hash_errors_instead_of_matching() {
        assert!(verify_password("anything", "not a phc string").is_err());
    }

    #[test]
    fn marker_round_trip() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("nested").join("app-lock-enabled");
        assert!(!marker_present(&path));

        write_marker(&path).unwrap();
        assert!(marker_present(&path));

        remove_marker(&path).unwrap();
        assert!(!marker_present(&path));

        // Idempotent: removing again is fine.
        remove_marker(&path).unwrap();
    }
}
