//! The iCloud change watcher: an `NSMetadataQuery` over the graph (Plan 21
//! Phase 2).
//!
//! Its job is the conflict signal: a conflict version appearing does not
//! necessarily touch the working file, so the `notify` watcher alone would
//! sit silent; the query's `HasUnresolvedConflicts` flag is what triggers a
//! sweep promptly.
//!
//! Threading follows the platform contract: the query starts/stops on the
//! main thread (kept there via `MainThreadBound`), results are delivered on a
//! private `NSOperationQueue`, and the notification handler diffs a plain
//! Rust snapshot — no Objective-C state crosses threads.
//!
//! Items whose download status is not "current" get a one-time download
//! nudge, so an evicted file lands back on the device without waiting for
//! Finder.

use crate::error::AppResult;

/// Command: watch the graph at `root` for iCloud changes. Conflict paths
/// emit as `icloud:conflicts`; file events are the `notify` watcher's job.
#[tauri::command]
pub fn icloud_watch_start(root: String, app: tauri::AppHandle) -> AppResult<()> {
    platform::start(app, root)
}

/// Command: stop the active watch (graph switch or shutdown). Idempotent.
#[tauri::command]
pub fn icloud_watch_stop(app: tauri::AppHandle) -> AppResult<()> {
    platform::stop(app)
}

mod platform {
    use std::collections::HashSet;
    use std::ptr::NonNull;
    use std::sync::{LazyLock, Mutex};

    use block2::RcBlock;
    use dispatch2::MainThreadBound;
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::{msg_send, MainThreadMarker};
    use objc2_foundation::{
        NSArray, NSCopying, NSMetadataItem, NSMetadataItemPathKey, NSMetadataQuery,
        NSMetadataQueryDidFinishGatheringNotification, NSMetadataQueryDidUpdateNotification,
        NSMetadataQueryUbiquitousDocumentsScope, NSMetadataQueryUpdateAddedItemsKey,
        NSMetadataQueryUpdateChangedItemsKey, NSMetadataQueryUpdateRemovedItemsKey,
        NSMetadataUbiquitousItemDownloadingStatusCurrent,
        NSMetadataUbiquitousItemDownloadingStatusKey,
        NSMetadataUbiquitousItemHasUnresolvedConflictsKey, NSNotification, NSNotificationCenter,
        NSNumber, NSOperationQueue, NSPredicate, NSString,
    };
    use tauri::Emitter;

    use crate::error::{AppError, AppResult};

    /// How long the query buckets live updates before delivering one
    /// `DidUpdate` notification. During an initial mass download thousands of
    /// files flip to current one by one; without an explicit interval each
    /// flip can arrive as its own notification. Two seconds collapses a
    /// download burst into a handful of batches.
    const UPDATE_BATCHING_INTERVAL_S: f64 = 2.0;

    /// The live query plus everything that must stay alive (and on the main
    /// thread) with it.
    struct Watch {
        query: Retained<NSMetadataQuery>,
        /// Never read — held so the delivery queue outlives the query.
        _queue: Retained<NSOperationQueue>,
        tokens: Vec<Retained<AnyObject>>,
    }

    /// The active watch, pinned to the main thread. `MainThreadBound` keeps
    /// the non-`Send` Objective-C handles sound inside a global.
    static ACTIVE: Mutex<Option<MainThreadBound<Watch>>> = Mutex::new(None);

    /// Graph-relative paths whose download this watch already requested.
    /// The OS treats repeat requests as no-ops, but *issuing* them is not
    /// free: during an initial sync every update round used to re-request
    /// every still-pending placeholder — O(N) `NSFileManager` calls per
    /// round, O(N²) across a large download. Each path is nudged once;
    /// completion (or removal) clears it so a later eviction can re-nudge.
    static NUDGED: LazyLock<Mutex<HashSet<String>>> = LazyLock::new(|| Mutex::new(HashSet::new()));

    /// Lifecycle epoch: every `start`/`stop` bumps it, and a queued install
    /// only proceeds when its epoch is still current. Commands run off the
    /// main thread while installs run *on* it, so without this a second
    /// `start` could slip in before the first's install executed — `stop`
    /// would find `ACTIVE` still empty, and the first query would leak,
    /// its observers emitting events for the wrong graph root forever
    /// (dropping observer tokens does not deregister them).
    static EPOCH: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

    pub fn start(app: tauri::AppHandle, root: String) -> AppResult<()> {
        use std::sync::atomic::Ordering;
        let epoch = EPOCH.fetch_add(1, Ordering::SeqCst) + 1;
        let handle = app.clone();
        app.run_on_main_thread(move || install(handle, root, epoch))
            .map_err(|err| AppError::io(format!("failed to reach the main thread: {err}")))
    }

    pub fn stop(app: tauri::AppHandle) -> AppResult<()> {
        use std::sync::atomic::Ordering;
        // Invalidate any queued-but-not-yet-run install…
        EPOCH.fetch_add(1, Ordering::SeqCst);
        // …and tear down whatever is actually live, on the main thread —
        // where installs also run, so the two can never interleave.
        app.run_on_main_thread(move || {
            let mtm = MainThreadMarker::new().expect("run_on_main_thread is the main thread");
            teardown_active(mtm);
        })
        .map_err(|err| AppError::io(format!("failed to reach the main thread: {err}")))
    }

    /// Stop and deregister the live watch, if any. Main thread only — every
    /// caller is a main-thread closure, which is what serializes teardown
    /// against installs.
    fn teardown_active(mtm: MainThreadMarker) {
        let Some(bound) = ACTIVE.lock().expect("watch lock").take() else {
            return;
        };
        let watch = bound.into_inner(mtm);
        watch.query.stopQuery();
        let center = NSNotificationCenter::defaultCenter();
        for token in &watch.tokens {
            unsafe {
                let _: () = msg_send![&center, removeObserver: &**token];
            }
        }
    }

    /// The root plus its canonicalized twin, both slash-terminated. Spotlight
    /// reports real paths — on iOS the container lives behind the `/var` →
    /// `/private/var` symlink, so a predicate (or a prefix strip) built from
    /// the un-resolved root alone would match nothing and the watch would sit
    /// silent. The trailing slash makes both the predicate and the strip a
    /// real path boundary: `…/Notes` must never claim `…/Notes-old/…`.
    fn root_variants(root: &str) -> Vec<String> {
        let with_slash = |value: &str| format!("{}/", value.trim_end_matches('/'));
        let mut variants = vec![with_slash(root)];
        if let Ok(canonical) = std::fs::canonicalize(root) {
            let canonical = with_slash(&canonical.to_string_lossy());
            if !variants.contains(&canonical) {
                variants.push(canonical);
            }
        }
        variants
    }

    /// Build, wire, and start the query. Main thread only. Tears down any
    /// live watch first (installs and stops all run here, serially), and
    /// aborts when a later `start`/`stop` has superseded this one's epoch —
    /// so rapid graph switches can never leave two queries running or
    /// install a watch after its graph closed.
    fn install(app: tauri::AppHandle, root: String, epoch: u64) {
        use std::sync::atomic::Ordering;
        let mtm = MainThreadMarker::new().expect("run_on_main_thread is the main thread");
        teardown_active(mtm);
        if EPOCH.load(Ordering::SeqCst) != epoch {
            return; // superseded while queued — a newer install/stop owns the lifecycle
        }
        NUDGED.lock().expect("nudge lock").clear();
        let query = NSMetadataQuery::new();
        query.setNotificationBatchingInterval(UPDATE_BATCHING_INTERVAL_S);

        let scope: Retained<NSString> = unsafe { NSMetadataQueryUbiquitousDocumentsScope.copy() };
        let scopes = NSArray::from_retained_slice(&[scope]);
        // setSearchScopes/argumentArray take untyped NSArrays the bindings
        // can't coerce typed arrays into — message directly.
        unsafe {
            let _: () = msg_send![&query, setSearchScopes: &*scopes];
        }

        let roots = root_variants(&root);
        let path_key: Retained<NSString> = unsafe { NSMetadataItemPathKey.copy() };
        let format = NSString::from_str(
            &(0..roots.len())
                .map(|_| "(%K BEGINSWITH %@)")
                .collect::<Vec<_>>()
                .join(" OR "),
        );
        let mut arg_list: Vec<Retained<NSString>> = Vec::new();
        for variant in &roots {
            arg_list.push(path_key.copy());
            arg_list.push(NSString::from_str(variant));
        }
        let args = NSArray::from_retained_slice(&arg_list);
        let predicate: Retained<NSPredicate> = unsafe {
            msg_send![
                objc2::class!(NSPredicate),
                predicateWithFormat: &*format,
                argumentArray: &*args
            ]
        };
        query.setPredicate(Some(&predicate));

        let queue = NSOperationQueue::new();
        // Must stay serial: CloudDocs (BRQuery) schedules its own internal,
        // unsynchronized gatherer work on this queue — not just notification
        // delivery. On the default concurrent queue the initial gather and
        // update batches classify items in parallel and corrupt BRQuery's
        // result index sets, aborting with an uncaught NSRangeException
        // (crash: NSMutableIndexSet addIndexesInRange in
        // _handleReplacedItemsNotifications, ~10s after launch).
        queue.setMaxConcurrentOperationCount(1);
        unsafe { query.setOperationQueue(Some(&queue)) };

        let handler_roots = roots.clone();
        let emit_app = app.clone();
        let block = RcBlock::new(move |notification: NonNull<NSNotification>| {
            handle_notification(&app, &handler_roots, notification);
        });
        let center = NSNotificationCenter::defaultCenter();
        let query_object: &AnyObject = &query;
        let mut tokens = Vec::new();
        for name in [
            unsafe { NSMetadataQueryDidFinishGatheringNotification },
            unsafe { NSMetadataQueryDidUpdateNotification },
        ] {
            let token: Retained<AnyObject> = unsafe {
                msg_send![
                    &center,
                    addObserverForName: name,
                    object: query_object,
                    queue: &*queue,
                    usingBlock: &*block
                ]
            };
            tokens.push(token);
        }

        if !query.startQuery() {
            // Per Apple docs this means "already running" or "no predicate" —
            // neither can happen for this fresh, predicated query, but if it
            // ever does, an installed-but-dead watch would silently eat the
            // stop/start lifecycle. Tear the observers down and leave ACTIVE
            // empty instead; the controller's resume-triggered sweeps keep
            // conflict handling alive without the query. (The install runs
            // fire-and-forget on the main thread, so the command has already
            // returned — an error can't reach the caller from here.)
            tracing::warn!("iCloud metadata query failed to start; falling back to sweep triggers");
            let center = NSNotificationCenter::defaultCenter();
            for token in &tokens {
                unsafe {
                    let _: () = msg_send![&center, removeObserver: &**token];
                }
            }
            // The command returned long ago (this closure is fire-and-forget
            // on the main thread), so surface the failure as an event: the
            // controller logs it loudly and runs an immediate fallback sweep
            // — on iOS the query is the sole live change source, and a
            // silently dead watch would otherwise read as "no changes".
            let _ = emit_app.emit("icloud:watch-failed", ());
            return;
        }
        *ACTIVE.lock().expect("watch lock") = Some(MainThreadBound::new(
            Watch {
                query,
                _queue: queue,
                tokens,
            },
            mtm,
        ));
    }

    /// One tracked item's state, extracted from its `NSMetadataItem`.
    struct ItemState {
        /// Graph-relative note path.
        rel: String,
        /// Absolute path, for download requests.
        abs: String,
        /// True when the content is local ("current"); false for placeholders
        /// and partial downloads.
        downloaded: bool,
        /// The provider's unresolved-conflict flag.
        conflict: bool,
    }

    /// Extract the tracked state from one metadata item; `None` for items
    /// outside the graph's note directories.
    fn item_state(item: &NSMetadataItem, roots: &[String]) -> Option<ItemState> {
        let abs = attr_string(item, unsafe { NSMetadataItemPathKey })?;
        let rel = tracked_note_relpath(&abs, roots)?;
        let downloaded = attr_string(item, unsafe {
            NSMetadataUbiquitousItemDownloadingStatusKey
        })
        .is_some_and(|status| {
            status == unsafe { NSMetadataUbiquitousItemDownloadingStatusCurrent }.to_string()
        });
        let conflict = attr_bool(item, unsafe {
            NSMetadataUbiquitousItemHasUnresolvedConflictsKey
        });
        Some(ItemState {
            rel,
            abs,
            downloaded,
            conflict,
        })
    }

    /// Pure half of the nudge bookkeeping: mark placeholders not yet nudged
    /// this watch (returning their absolute paths, for the caller to
    /// request), and clear completed ones so a later eviction re-nudges.
    fn plan_nudges(nudged: &mut HashSet<String>, items: &[ItemState]) -> Vec<String> {
        let mut request: Vec<String> = Vec::new();
        for item in items {
            if item.downloaded {
                nudged.remove(&item.rel);
            } else if nudged.insert(item.rel.clone()) {
                request.push(item.abs.clone());
            }
        }
        request
    }

    /// Request downloads for the placeholders [`plan_nudges`] marked.
    fn nudge_pending(items: &[ItemState]) {
        let request = {
            let mut nudged = NUDGED.lock().expect("nudge lock");
            plan_nudges(&mut nudged, items)
        };
        for abs in request {
            crate::icloud::storage::request_download(std::path::Path::new(&abs));
        }
    }

    /// The items the provider flags as carrying unresolved conflict versions.
    fn conflicted_rels(items: &[ItemState]) -> Vec<String> {
        items
            .iter()
            .filter(|item| item.conflict)
            .map(|item| item.rel.clone())
            .collect()
    }

    /// One gathering/update round. Updates apply the notification's own
    /// added/changed/removed delta — O(changed items); a full results
    /// enumeration here would be O(all items) per round, O(n²) across an
    /// initial mass download. The gather round (and an update without a
    /// usable delta) still snapshots the full listing.
    fn handle_notification(
        app: &tauri::AppHandle,
        roots: &[String],
        notification: NonNull<NSNotification>,
    ) {
        let notification = unsafe { notification.as_ref() };
        let Some(object) = notification.object() else {
            return;
        };
        let Ok(query) = object.downcast::<NSMetadataQuery>() else {
            return;
        };

        let is_update = &*notification.name() == unsafe { NSMetadataQueryDidUpdateNotification };
        let conflicts = if is_update {
            match update_delta(notification, roots) {
                Some((upserted, removed)) => update_round(&upserted, &removed),
                None => full_round(&query, roots),
            }
        } else {
            full_round(&query, roots)
        };

        if !conflicts.is_empty() {
            let mut conflicts = conflicts;
            conflicts.sort();
            let _ = app.emit("icloud:conflicts", conflicts);
        }
    }

    /// Apply one update notification's delta: nudge new placeholders, drop
    /// nudge marks for removed items, and return the conflicted paths.
    fn update_round(upserted: &[ItemState], removed: &[String]) -> Vec<String> {
        nudge_pending(upserted);
        {
            let mut nudged = NUDGED.lock().expect("nudge lock");
            for rel in removed {
                nudged.remove(rel);
            }
        }
        conflicted_rels(upserted)
    }

    /// Process the query's full results listing — the gather round, and the
    /// fallback for an update notification without a usable delta.
    fn full_round(query: &NSMetadataQuery, roots: &[String]) -> Vec<String> {
        query.disableUpdates();
        let results = query.results();
        let mut items: Vec<ItemState> = Vec::new();
        for item in results.iter() {
            let Ok(item) = item.downcast::<NSMetadataItem>() else {
                continue;
            };
            if let Some(state) = item_state(&item, roots) {
                items.push(state);
            }
        }
        query.enableUpdates();

        nudge_pending(&items);
        let listed: HashSet<&str> = items.iter().map(|item| item.rel.as_str()).collect();
        {
            // Placeholders that vanished from the listing can't complete —
            // drop their nudge marks.
            let mut nudged = NUDGED.lock().expect("nudge lock");
            nudged.retain(|rel| listed.contains(rel.as_str()));
        }
        conflicted_rels(&items)
    }

    /// The added/changed/removed items an update notification carries in its
    /// `userInfo`. `None` when the dictionary is missing entirely (fall back
    /// to a full round); empty arrays are a real "nothing tracked changed".
    fn update_delta(
        notification: &NSNotification,
        roots: &[String],
    ) -> Option<(Vec<ItemState>, Vec<String>)> {
        let info = notification.userInfo()?;
        let items_for = |key: &NSString| -> Vec<Retained<NSMetadataItem>> {
            let value: Option<Retained<AnyObject>> =
                unsafe { msg_send![&*info, objectForKey: key] };
            let Some(value) = value else {
                return Vec::new();
            };
            let Ok(array) = value.downcast::<NSArray>() else {
                return Vec::new();
            };
            array
                .iter()
                .filter_map(|item| item.downcast::<NSMetadataItem>().ok())
                .collect()
        };
        let mut upserted: Vec<ItemState> = Vec::new();
        for key in [unsafe { NSMetadataQueryUpdateAddedItemsKey }, unsafe {
            NSMetadataQueryUpdateChangedItemsKey
        }] {
            for item in items_for(key) {
                if let Some(state) = item_state(&item, roots) {
                    upserted.push(state);
                }
            }
        }
        let removed: Vec<String> = items_for(unsafe { NSMetadataQueryUpdateRemovedItemsKey })
            .iter()
            .filter_map(|item| {
                let path = attr_string(item, unsafe { NSMetadataItemPathKey })?;
                tracked_note_relpath(&path, roots)
            })
            .collect();
        Some((upserted, removed))
    }

    /// The watcher's note-tracking rule, over absolute metadata paths:
    /// `.md` under `daily/`, `notes/`, or `templates/`, graph-relative. Tries
    /// every root variant — Spotlight may report either side of the
    /// `/var` ↔ `/private/var` symlink. Variants are slash-terminated
    /// ([`root_variants`]), so the strip is a path boundary, not a string
    /// prefix — a sibling `…/Notes-old/` can never masquerade as the graph.
    fn tracked_note_relpath(path: &str, roots: &[String]) -> Option<String> {
        let rel = roots
            .iter()
            .find_map(|root| path.strip_prefix(root.as_str()))?;
        let tracked = (rel.starts_with("daily/")
            || rel.starts_with("notes/")
            || rel.starts_with("templates/"))
            && rel.ends_with(".md");
        tracked.then(|| rel.to_string())
    }

    /// A metadata attribute as a string; `None` when absent or another type.
    fn attr_string(item: &NSMetadataItem, key: &NSString) -> Option<String> {
        let value = item.valueForAttribute(key)?;
        value.downcast::<NSString>().ok().map(|s| s.to_string())
    }

    /// A boolean metadata attribute; absent or non-numeric reads as `false`.
    fn attr_bool(item: &NSMetadataItem, key: &NSString) -> bool {
        item.valueForAttribute(key)
            .and_then(|value| value.downcast::<NSNumber>().ok())
            .map(|number| number.boolValue())
            .unwrap_or(false)
    }

    #[cfg(test)]
    mod tests {
        use super::{plan_nudges, root_variants, tracked_note_relpath, ItemState};
        use std::collections::HashSet;

        fn item(rel: &str, downloaded: bool) -> ItemState {
            ItemState {
                rel: rel.to_string(),
                abs: format!("/container/Notes/{rel}"),
                downloaded,
                conflict: false,
            }
        }

        #[test]
        fn plan_nudges_requests_each_placeholder_once() {
            let mut nudged: HashSet<String> = HashSet::new();
            let stub = item("notes/a.md", false);

            // First sighting: request it. Every later round: already marked.
            assert_eq!(
                plan_nudges(&mut nudged, std::slice::from_ref(&stub)),
                vec!["/container/Notes/notes/a.md".to_string()]
            );
            assert!(plan_nudges(&mut nudged, std::slice::from_ref(&stub)).is_empty());

            // Completion clears the mark, so a later eviction re-nudges.
            let downloaded = item("notes/a.md", true);
            assert!(plan_nudges(&mut nudged, std::slice::from_ref(&downloaded)).is_empty());
            assert!(!nudged.contains("notes/a.md"));
            assert_eq!(
                plan_nudges(&mut nudged, std::slice::from_ref(&stub)),
                vec!["/container/Notes/notes/a.md".to_string()]
            );
        }

        #[test]
        fn root_variants_are_slash_terminated_and_include_the_canonical_twin() {
            let dir = tempfile::tempdir().expect("tempdir");
            let root = dir.path().to_string_lossy().into_owned();
            let variants = root_variants(&root);
            assert_eq!(variants[0], format!("{root}/"));
            assert!(variants.iter().all(|variant| variant.ends_with('/')));
            // macOS tempdirs live behind the /var → /private/var symlink; the
            // canonical twin must be present (deduped when root is already
            // canonical).
            let canonical = std::fs::canonicalize(dir.path()).expect("canonicalize");
            let canonical = format!("{}/", canonical.to_string_lossy());
            assert!(variants.contains(&canonical));
            let unique: std::collections::BTreeSet<&String> = variants.iter().collect();
            assert_eq!(unique.len(), variants.len(), "variants must not repeat");
        }

        #[test]
        fn tracks_notes_relative_to_any_root_variant() {
            let roots = vec![
                "/var/mobile/Containers/Notes/".to_string(),
                "/private/var/mobile/Containers/Notes/".to_string(),
            ];
            // Spotlight may report the resolved (/private) side of the root
            // symlink; either variant must strip.
            assert_eq!(
                tracked_note_relpath("/var/mobile/Containers/Notes/daily/2026-07-04.md", &roots),
                Some("daily/2026-07-04.md".to_string())
            );
            assert_eq!(
                tracked_note_relpath("/private/var/mobile/Containers/Notes/notes/idea.md", &roots),
                Some("notes/idea.md".to_string())
            );
            assert_eq!(
                tracked_note_relpath("/var/mobile/Containers/Notes/.dayjot/index.sqlite", &roots),
                None
            );
            assert_eq!(tracked_note_relpath("/elsewhere/notes/a.md", &roots), None);
            // A sibling directory sharing the root as a string prefix is not
            // inside the graph — the slash-terminated variant refuses it.
            assert_eq!(
                tracked_note_relpath("/var/mobile/Containers/Notes-old/notes/a.md", &roots),
                None
            );
        }
    }
}
