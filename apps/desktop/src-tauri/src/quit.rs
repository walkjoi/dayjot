//! Quit-time flush handshake.
//!
//! Every macOS quit (⌘Q, Dock → Quit, logout) goes through
//! `-[NSApplication terminate:]`, which closes no windows, so the frontend's
//! close-requested flush never runs and a note save still inside its debounce
//! would be lost. tao's app delegate doesn't implement
//! `applicationShouldTerminate:`, so [`install`] adds it: termination is
//! deferred, every webview flushes on `app:quit-requested` and calls
//! [`quit_confirm`], and the last confirmation (or [`FLUSH_DEADLINE`]) lets
//! AppKit finish quitting.

use std::collections::HashSet;
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, State};

use platform::finish;
pub use platform::install;

/// How long a quit waits for flushes before giving up on them, so a wedged
/// webview can't block quitting (or a logout) forever.
const FLUSH_DEADLINE: Duration = Duration::from_secs(5);

/// Labels of webviews that still owe a flush confirmation; empty when no quit
/// is in flight. Tracked per label so a window that confirms and is then
/// destroyed, or confirms again after a second ⌘Q, counts once.
#[derive(Default)]
pub struct QuitState {
    pending: Mutex<HashSet<String>>,
}

impl QuitState {
    fn lock(&self) -> MutexGuard<'_, HashSet<String>> {
        // The set stays valid whatever a panic interrupted; don't wedge quit.
        self.pending
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
    }

    /// Start (or restart, on a repeated ⌘Q) the handshake for `windows`.
    pub fn arm(&self, windows: impl IntoIterator<Item = String>) {
        let mut pending = self.lock();
        pending.clear();
        pending.extend(windows);
    }

    /// Whether a quit is waiting on confirmations. Window creation checks
    /// this: a webview born mid-handshake would never be waited on.
    pub fn armed(&self) -> bool {
        !self.lock().is_empty()
    }

    /// Settle `label`'s obligation (confirmed, or destroyed). True only when
    /// it was the last one owed.
    pub fn settle(&self, label: &str) -> bool {
        let mut pending = self.lock();
        pending.remove(label) && pending.is_empty()
    }

    /// Drop every remaining obligation. True when a handshake was still open.
    pub fn abandon(&self) -> bool {
        let mut pending = self.lock();
        let open = !pending.is_empty();
        pending.clear();
        open
    }
}

/// Defer termination for a flush. False when there is nothing to flush.
fn begin(app: &AppHandle) -> bool {
    let windows: Vec<String> = app.webview_windows().keys().cloned().collect();
    if windows.is_empty() {
        return false;
    }
    app.state::<QuitState>().arm(windows);
    let _ = app.emit("app:quit-requested", ());
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(FLUSH_DEADLINE);
        if handle.state::<QuitState>().abandon() {
            tracing::warn!("quit flush missed its deadline; quitting anyway");
            finish();
        }
    });
    true
}

/// Settle a destroyed window: it can no longer confirm, and the survivors'
/// quit must not hang on it.
pub fn window_destroyed(app: &AppHandle, label: &str) {
    if app.state::<QuitState>().settle(label) {
        finish();
    }
}

/// Confirm the deferred quit for the calling window: its frontend has flushed.
#[tauri::command]
pub fn quit_confirm(window: tauri::WebviewWindow, state: State<'_, QuitState>) {
    if state.settle(window.label()) {
        finish();
    }
}

mod platform {
    use std::sync::OnceLock;

    use dispatch2::DispatchQueue;
    use objc2::ffi::class_addMethod;
    use objc2::runtime::{AnyClass, AnyObject, Imp, Sel};
    use objc2::{sel, MainThreadMarker};
    use objc2_app_kit::{NSApplication, NSApplicationTerminateReply};
    use tauri::AppHandle;

    /// The app the delegate method serves; an Objective-C method has no
    /// closure to carry it.
    static APP: OnceLock<AppHandle> = OnceLock::new();

    type ShouldTerminate =
        extern "C-unwind" fn(&AnyObject, Sel, &AnyObject) -> NSApplicationTerminateReply;

    extern "C-unwind" fn application_should_terminate(
        _delegate: &AnyObject,
        _cmd: Sel,
        _sender: &AnyObject,
    ) -> NSApplicationTerminateReply {
        match APP.get() {
            Some(app) if super::begin(app) => NSApplicationTerminateReply::TerminateLater,
            _ => NSApplicationTerminateReply::TerminateNow,
        }
    }

    /// Add `applicationShouldTerminate:` to tao's app delegate. Call once on
    /// the main thread, after the event loop has set the delegate.
    pub fn install(app: &AppHandle) {
        let Some(mtm) = MainThreadMarker::new() else {
            return tracing::error!("quit hook must be installed on the main thread");
        };
        let Some(delegate) = NSApplication::sharedApplication(mtm).delegate() else {
            return tracing::error!("no app delegate; quitting can lose unsaved edits");
        };
        if APP.set(app.clone()).is_err() {
            return;
        }
        let class: *const AnyClass = AsRef::<AnyObject>::as_ref(&*delegate).class();
        // SAFETY: the function matches the `Q@:@` signature AppKit calls
        // `applicationShouldTerminate:` with, and the delegate class doesn't
        // define the selector (`class_addMethod` refuses to replace one).
        let added = unsafe {
            let imp: Imp = std::mem::transmute(application_should_terminate as ShouldTerminate);
            class_addMethod(
                class.cast_mut(),
                sel!(applicationShouldTerminate:),
                imp,
                c"Q@:@".as_ptr(),
            )
        };
        if !added.as_bool() {
            tracing::error!("app delegate already handles termination; quit flush not installed");
        }
    }

    /// Let AppKit finish the termination deferred by `TerminateLater`. The
    /// reply runs from the main dispatch queue, never inside a tao event
    /// callback: AppKit then calls tao's `applicationWillTerminate`, which
    /// takes the callback lock and would deadlock.
    pub fn finish() {
        DispatchQueue::main().exec_async(|| {
            let mtm = MainThreadMarker::new().expect("the main queue runs on the main thread");
            NSApplication::sharedApplication(mtm).replyToApplicationShouldTerminate(true);
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn arms_per_window_and_concludes_on_the_last_settle() {
        let state = QuitState::default();
        state.arm(["main".into(), "note-a".into()]);
        assert!(!state.settle("main"));
        assert!(state.settle("note-a"));
        assert!(!state.settle("main"));
    }

    #[test]
    fn one_window_cannot_spend_two_obligations() {
        let state = QuitState::default();
        state.arm(["main".into(), "note-a".into()]);
        assert!(!state.settle("main")); // confirmed
        assert!(!state.settle("main")); // then destroyed
        assert!(state.settle("note-a"));
    }

    #[test]
    fn settling_without_an_armed_quit_is_inert() {
        let state = QuitState::default();
        assert!(!state.settle("main"));
    }

    #[test]
    fn unknown_labels_never_conclude_the_handshake() {
        let state = QuitState::default();
        state.arm(["main".into()]);
        assert!(!state.settle("note-b")); // opened after arming
        assert!(state.settle("main"));
    }

    #[test]
    fn rearming_restarts_the_handshake() {
        let state = QuitState::default();
        state.arm(["main".into(), "note-a".into()]);
        assert!(!state.settle("main"));
        state.arm(["main".into(), "note-a".into()]); // second ⌘Q
        assert!(!state.settle("main"));
        assert!(state.settle("note-a"));
    }

    #[test]
    fn abandoning_concludes_once() {
        let state = QuitState::default();
        state.arm(["main".into(), "note-a".into()]);
        assert!(state.abandon());
        assert!(!state.armed());
        assert!(!state.abandon());
        assert!(!state.settle("note-a")); // a late confirm can't finish twice
    }
}
