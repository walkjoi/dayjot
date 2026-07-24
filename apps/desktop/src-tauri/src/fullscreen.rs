//! ⌘W-as-hide for the macOS main window (the close-requested path in
//! `quit-flush.ts`).
//!
//! Hiding an `NSWindow` that owns a macOS fullscreen Space strands the Space:
//! it stays active but empty — a black screen. The webview cannot sequence
//! the exit itself: tao clears the state `isFullscreen()` reads
//! *synchronously* inside `set_fullscreen(false)`, before AppKit's exit
//! transition even starts, so a frontend poll believes the window has left
//! the Space it still owns. The completion signal AppKit does offer —
//! `NSWindowDidExitFullScreenNotification` — is only observable from the
//! shell, so the shell owns the whole hide.

use crate::error::{AppError, AppResult};

/// Hide `window` as its ⌘W "close" behavior. On macOS this first leaves the
/// window's fullscreen Space (bounded wait), so the hide can never strand an
/// empty Space.
#[tauri::command]
pub async fn window_hide_for_close(window: tauri::WebviewWindow) -> AppResult<()> {
    platform::leave_fullscreen_space(&window).await;
    window
        .hide()
        .map_err(|err| AppError::io(format!("failed to hide window: {err}")))
}

#[cfg(target_os = "macos")]
mod platform {
    use std::ptr::NonNull;
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    use block2::RcBlock;
    use dispatch2::MainThreadBound;
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::{msg_send, MainThreadMarker};
    use objc2_app_kit::NSWindowDidExitFullScreenNotification;
    use objc2_foundation::{NSNotification, NSNotificationCenter, NSOperationQueue};

    /// Upper bound on waiting out the exit transition. Generous on purpose:
    /// ⌘W during the *enter* animation chains two transitions (tao defers the
    /// exit until the enter completes), and a wedged transition must degrade
    /// to "hide anyway", never a window that refuses to close.
    const EXIT_DEADLINE: Duration = Duration::from_secs(5);

    /// Leave the window's fullscreen Space and wait (bounded) until AppKit
    /// reports the transition finished. No-op for a windowed `window`.
    pub async fn leave_fullscreen_space(window: &tauri::WebviewWindow) {
        if !window.is_fullscreen().unwrap_or(false) {
            return;
        }
        let (exited_tx, exited_rx) = tokio::sync::oneshot::channel::<()>();
        // The observer token crosses back here for deregistration;
        // `MainThreadBound` keeps the non-`Send` handle sound in transit.
        let (token_tx, token_rx) =
            std::sync::mpsc::channel::<MainThreadBound<Retained<AnyObject>>>();
        let handle = window.clone();
        let installed = window.run_on_main_thread(move || {
            let mtm = MainThreadMarker::new().expect("run_on_main_thread is the main thread");
            // One-shot from every path: the notification block, and the
            // bail-outs for which no notification will ever come.
            let exited_tx = Mutex::new(Some(exited_tx));
            let fire = Arc::new(move || {
                if let Some(sender) = exited_tx.lock().expect("exit signal lock").take() {
                    let _ = sender.send(());
                }
            });
            // Re-check on the main thread: the transition may have completed
            // while this closure was queued.
            if !handle.is_fullscreen().unwrap_or(false) {
                return fire();
            }
            let Ok(ns_window) = handle.ns_window() else {
                return fire();
            };
            // SAFETY: the pointer is the live NSWindow tauri owns for this
            // window, and it is only dereferenced here, on the main thread.
            let ns_window = unsafe { &*ns_window.cast::<AnyObject>() };
            let block_fire = Arc::clone(&fire);
            let block = RcBlock::new(move |_: NonNull<NSNotification>| block_fire());
            let center = NSNotificationCenter::defaultCenter();
            // A nil queue delivers on the posting thread (the main thread);
            // the block only resolves the oneshot, so no queue must outlive it.
            let token: Retained<AnyObject> = unsafe {
                msg_send![
                    &center,
                    addObserverForName: NSWindowDidExitFullScreenNotification,
                    object: ns_window,
                    queue: Option::<&NSOperationQueue>::None,
                    usingBlock: &*block
                ]
            };
            let _ = token_tx.send(MainThreadBound::new(token, mtm));
            if handle.set_fullscreen(false).is_err() {
                // The exit never started, so its notification never fires.
                fire();
            }
        });
        if installed.is_err() {
            return; // the main thread is unreachable; degrade to a plain hide
        }
        if tokio::time::timeout(EXIT_DEADLINE, exited_rx).await.is_err() {
            tracing::warn!("fullscreen exit missed the deadline; hiding anyway");
        }
        // Deregister the observer — dropping a token does not, and a leaked
        // observer would re-fire on every later fullscreen exit. The token
        // was sent before the toggle, so it is already here on the success
        // path; an empty channel means no observer was installed.
        if let Ok(token) = token_rx.try_recv() {
            let _ = window.run_on_main_thread(move || {
                let mtm = MainThreadMarker::new().expect("run_on_main_thread is the main thread");
                let token = token.into_inner(mtm);
                let center = NSNotificationCenter::defaultCenter();
                unsafe {
                    let _: () = msg_send![&center, removeObserver: &*token];
                }
            });
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    /// Only macOS has fullscreen Spaces to leave; elsewhere the hide needs no
    /// preamble. Kept `async` so the command's await is platform-uniform.
    pub async fn leave_fullscreen_space(_window: &tauri::WebviewWindow) {}
}
