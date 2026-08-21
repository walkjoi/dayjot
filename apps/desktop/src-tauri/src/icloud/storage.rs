//! iCloud Drive document storage (Plan 21).
//!
//! Per Plan 21 contract 1 an iCloud-synced graph lives at
//! `<container>/Documents/<name>/` in the app's iCloud Drive container
//! (visible as "DayJot" in Finder's iCloud Drive), and the OS moves the
//! markdown between devices. Rust owns only the storage primitives —
//! resolving the container, finding the graphs inside it, and counting
//! undownloaded ("dataless" `.icloud`) placeholders. Which root the graph
//! actually opens in is frontend policy.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{AppError, AppResult};

/// The graph directory name used when a nameless root is adopted into the
/// container. A plain, human name — it reads as `iCloud Drive → DayJot →
/// Notes` in Files/Finder, and becomes the graph's display name. (The
/// onboarding default lives frontend-side as `DEFAULT_ICLOUD_GRAPH_NAME`.)
const DEFAULT_ICLOUD_GRAPH_DIR: &str = "Notes";

/// Command: count the `.icloud` placeholders under `root` without requesting
/// anything (the metadata watch owns the download requests). `notes_only`
/// restricts the count to markdown under the note directories.
#[tauri::command]
pub async fn icloud_pending_count(root: String, notes_only: bool) -> AppResult<u32> {
    tauri::async_runtime::spawn_blocking(move || {
        Ok(platform::pending_walk(Path::new(&root), notes_only))
    })
    .await
    .map_err(|err| AppError::io(err.to_string()))?
}

/// The graph's note directories — the download-scope filter and the
/// graph-detection probe share one list.
const NOTE_DIRS: [&str; 3] = ["daily", "notes", "templates"];

/// Whether a placeholder found under `rel_dir` (the stub's directory,
/// graph-relative) standing for `target` falls in the notes-only download
/// scope: markdown under one of the note directories.
fn placeholder_in_note_scope(rel_dir: &Path, target: &str) -> bool {
    let Some(first) = rel_dir.components().next() else {
        return false; // a stray placeholder at the graph root is not a note
    };
    let first = first.as_os_str().to_string_lossy();
    NOTE_DIRS.iter().any(|dir| *dir == first) && target.ends_with(".md")
}

/// Every existing graph among the container `Documents/` subdirectories
/// (name-sorted, for determinism): a user can keep several graphs in the
/// container, and onboarding lists them all.
fn find_graph_dirs(documents: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(documents) else {
        return Vec::new();
    };
    let mut dirs: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_dir() && dir_has_notes(path))
        .collect();
    dirs.sort();
    dirs
}

/// True when `root` already contains note files (downloaded, or eviction
/// placeholders per `crate::fs::icloud_placeholder_target` — the one home of
/// that grammar).
///
/// Looks one level into the standard note directories rather than requiring
/// `.dayjot/meta.json`: the index directory is excluded from sync on
/// purpose, so a synced-down graph arrives as bare `daily/`/`notes/` content.
fn dir_has_notes(root: &Path) -> bool {
    NOTE_DIRS.iter().any(|dir| {
        let Ok(entries) = std::fs::read_dir(root.join(dir)) else {
            return false;
        };
        entries.flatten().any(|entry| {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            name.ends_with(".md") || crate::fs::icloud_placeholder_target(&name).is_some()
        })
    })
}

/// Ask iCloud to (re)download one item, best-effort. The metadata-query
/// watch calls this for every non-current item a notification reports, so an
/// evicted file lands back on the device without waiting for Finder.
/// Requesting an in-flight download is a no-op for the OS.
pub(crate) fn request_download(abs: &Path) {
    let manager = objc2_foundation::NSFileManager::defaultManager();
    let _ = platform::start_download(&manager, abs);
}

mod platform {
    use std::path::{Path, PathBuf};

    use objc2_foundation::{NSFileManager, NSString, NSURL};

    /// The container's `Documents/` directory, created if missing. `None`
    /// when iCloud Drive is unavailable (signed out, entitlement missing).
    pub fn ubiquity_documents_dir() -> Option<PathBuf> {
        let manager = NSFileManager::defaultManager();
        let container = manager.URLForUbiquityContainerIdentifier(None)?;
        let path = container.path()?.to_string();
        let documents = PathBuf::from(path).join("Documents");
        if let Err(err) = std::fs::create_dir_all(&documents) {
            tracing::warn!(%err, "failed to create iCloud Documents directory");
            return None;
        }
        Some(documents)
    }

    /// Walk `root` counting `.icloud` placeholders. `notes_only` restricts
    /// the count to markdown under the note directories
    /// ([`super::placeholder_in_note_scope`]).
    pub fn pending_walk(root: &Path, notes_only: bool) -> u32 {
        let mut pending = 0;
        let mut stack = vec![root.to_path_buf()];
        while let Some(dir) = stack.pop() {
            let Ok(entries) = std::fs::read_dir(&dir) else {
                continue;
            };
            for entry in entries.flatten() {
                let path = entry.path();
                // Never follow links (they can loop, or point out of the
                // graph) — same rule as the adopt-copy walks below.
                if entry
                    .file_type()
                    .map(|kind| kind.is_symlink())
                    .unwrap_or(true)
                {
                    continue;
                }
                if path.is_dir() {
                    stack.push(path);
                    continue;
                }
                let name = entry.file_name();
                let name = name.to_string_lossy();
                let Some(target) = crate::fs::icloud_placeholder_target(&name) else {
                    continue;
                };
                if notes_only {
                    let in_scope = dir
                        .strip_prefix(root)
                        .is_ok_and(|rel_dir| super::placeholder_in_note_scope(rel_dir, target));
                    if !in_scope {
                        continue;
                    }
                }
                pending += 1;
            }
        }
        pending
    }

    pub(crate) fn start_download(manager: &NSFileManager, path: &Path) -> bool {
        let url = NSURL::fileURLWithPath(&NSString::from_str(&path.to_string_lossy()));
        match manager.startDownloadingUbiquitousItemAtURL_error(&url) {
            Ok(()) => true,
            Err(err) => {
                tracing::warn!(path = %path.display(), %err, "iCloud download request failed");
                false
            }
        }
    }
}

/// iCloud availability as desktop onboarding and settings consume it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IcloudStatus {
    /// True when the app can reach its iCloud Drive container (entitled
    /// build, signed-in account). Dev builds without the provisioning
    /// profile honestly report `false`.
    pub available: bool,
    /// The container's `Documents/` directory when available.
    pub documents_root: Option<String>,
    /// Every existing graph inside the container (name-sorted) — the
    /// returning-user fast path: onboarding lists them to open alongside
    /// creating a fresh one. Same rule as every container path: derive
    /// fresh, never persist.
    pub existing_graph_roots: Vec<String>,
}

/// Command: can this build reach the iCloud container? Runs on a blocking
/// thread — the first `URLForUbiquityContainerIdentifier` call may extend
/// the sandbox and touch the network, and Apple forbids it on the main
/// thread.
#[tauri::command]
pub async fn icloud_status() -> AppResult<IcloudStatus> {
    tauri::async_runtime::spawn_blocking(|| {
        let documents = platform::ubiquity_documents_dir();
        let existing_graph_roots = documents
            .as_deref()
            .map(find_graph_dirs)
            .unwrap_or_default()
            .into_iter()
            .map(|dir| dir.to_string_lossy().into_owned())
            .collect();
        Ok(IcloudStatus {
            available: documents.is_some(),
            documents_root: documents.map(|dir| dir.to_string_lossy().into_owned()),
            existing_graph_roots,
        })
    })
    .await
    .map_err(|err| AppError::io(err.to_string()))?
}

/// Command: copy the open graph into the iCloud container (Plan 21 Phase 1,
/// the desktop move-in) and return the new root. The copy is verified by
/// file count + byte totals before anything is reported; the original graph
/// is left untouched at its old path as the recovery copy — the caller
/// re-opens at the returned root, which re-bootstraps `.dayjot/` and
/// rebuilds the index there.
///
/// `.dayjot/` and `.git/` are deliberately not copied: the index is a
/// rebuildable projection, and a backup repo must never ride a file-sync
/// provider. The Git remote, if any, is disconnected by the caller first —
/// iCloud sync and a Git remote are mutually exclusive per graph (Plan 21).
#[tauri::command]
pub async fn icloud_adopt_graph(
    generation: u64,
    state: tauri::State<'_, crate::fs::GraphState>,
) -> AppResult<String> {
    let root = crate::fs::root_for_generation(&state, generation)?;
    tauri::async_runtime::spawn_blocking(move || adopt_graph(&root))
        .await
        .map_err(|err| AppError::io(err.to_string()))?
}

fn adopt_graph(root: &Path) -> AppResult<String> {
    let documents = platform::ubiquity_documents_dir().ok_or_else(|| {
        AppError::io("iCloud Drive is unavailable — sign in to iCloud and try again")
    })?;
    let name = root
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| DEFAULT_ICLOUD_GRAPH_DIR.to_string());
    let target = documents.join(&name);
    if dir_has_notes(&target) {
        return Err(AppError::io(format!(
            "iCloud Drive already contains a graph named \"{name}\" — open that one instead, or rename one of the two"
        )));
    }
    adopt_into(root, &target)?;
    Ok(target.to_string_lossy().into_owned())
}

/// Copy + count/byte verification, with retry hygiene: a failed or
/// unverified copy must not strand a half-copied tree at the target —
/// `dir_has_notes` would then refuse every retry until the user cleaned
/// iCloud Drive by hand. On failure the target is removed, but **only** when
/// this attempt effectively created it (missing or empty before); a
/// pre-existing non-empty folder is never deleted wholesale.
fn adopt_into(root: &Path, target: &Path) -> AppResult<()> {
    let target_was_fresh = !target.exists()
        || std::fs::read_dir(target)
            .map(|mut entries| entries.next().is_none())
            .unwrap_or(false);
    let outcome = copy_and_verify(root, target);
    if outcome.is_err() && target_was_fresh {
        let _ = std::fs::remove_dir_all(target); // best-effort retry hygiene
    }
    outcome
}

/// The copy + count/byte verification half of [`adopt_into`], separated so
/// its failure paths share one cleanup decision in the caller.
fn copy_and_verify(root: &Path, target: &Path) -> AppResult<()> {
    let copied = copy_graph_tree(root, target)?;
    let landed = count_graph_tree(target)?;
    if copied != landed {
        return Err(AppError::io(format!(
            "the iCloud copy did not verify (copied {} files / {} bytes, found {} / {}); the original graph is untouched",
            copied.0, copied.1, landed.0, landed.1
        )));
    }
    Ok(())
}

/// What stays behind on a move-in: the rebuildable local state, the backup
/// repo, and OS litter.
fn adopt_skips(name: &str) -> bool {
    matches!(name, ".dayjot" | ".git" | ".DS_Store")
}

/// Recursively copy the graph tree, returning `(files, bytes)` copied.
fn copy_graph_tree(source: &Path, target: &Path) -> AppResult<(u64, u64)> {
    std::fs::create_dir_all(target)?;
    let mut files = 0u64;
    let mut bytes = 0u64;
    let mut stack = vec![(source.to_path_buf(), target.to_path_buf())];
    while let Some((from_dir, to_dir)) = stack.pop() {
        for entry in std::fs::read_dir(&from_dir)? {
            let entry = entry?;
            let name = entry.file_name();
            if adopt_skips(&name.to_string_lossy()) {
                continue;
            }
            let file_type = entry.file_type()?;
            if file_type.is_symlink() {
                continue; // never follow links out of the graph
            }
            let from = entry.path();
            let to = to_dir.join(&name);
            if file_type.is_dir() {
                std::fs::create_dir_all(&to)?;
                stack.push((from, to));
            } else {
                bytes += std::fs::copy(&from, &to)?;
                files += 1;
            }
        }
    }
    Ok((files, bytes))
}

/// Count `(files, bytes)` in a copied tree, with the same skip rules.
fn count_graph_tree(root: &Path) -> AppResult<(u64, u64)> {
    let mut files = 0u64;
    let mut bytes = 0u64;
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in std::fs::read_dir(&dir)? {
            let entry = entry?;
            if adopt_skips(&entry.file_name().to_string_lossy()) {
                continue;
            }
            let file_type = entry.file_type()?;
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                stack.push(entry.path());
            } else {
                files += 1;
                bytes += entry.metadata()?.len();
            }
        }
    }
    Ok((files, bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn find_graph_dirs_lists_directories_with_notes() {
        let documents = tempfile::tempdir().expect("tempdir");
        assert_eq!(find_graph_dirs(documents.path()), Vec::<PathBuf>::new());

        // An empty graph dir (e.g. created then abandoned) is not a graph.
        std::fs::create_dir_all(documents.path().join("Empty/daily")).expect("mkdir");
        assert_eq!(find_graph_dirs(documents.path()), Vec::<PathBuf>::new());

        std::fs::create_dir_all(documents.path().join("Notes/daily")).expect("mkdir");
        std::fs::write(documents.path().join("Notes/daily/2026-07-04.md"), b"# hi").expect("write");
        assert_eq!(
            find_graph_dirs(documents.path()),
            vec![documents.path().join("Notes")]
        );

        // Deterministic under multiple graphs: all of them, name-sorted;
        // eviction placeholders count as notes.
        std::fs::create_dir_all(documents.path().join("Archive/notes")).expect("mkdir");
        std::fs::write(
            documents.path().join("Archive/notes/.old.md.icloud"),
            b"stub",
        )
        .expect("write");
        assert_eq!(
            find_graph_dirs(documents.path()),
            vec![
                documents.path().join("Archive"),
                documents.path().join("Notes")
            ]
        );
    }

    #[test]
    fn adopt_copy_skips_local_state_and_verifies() {
        let source = tempfile::tempdir().expect("tempdir");
        std::fs::create_dir_all(source.path().join("notes")).expect("mkdir");
        std::fs::create_dir_all(source.path().join(".dayjot")).expect("mkdir");
        std::fs::create_dir_all(source.path().join(".git")).expect("mkdir");
        std::fs::write(source.path().join("notes/a.md"), b"# A").expect("write");
        std::fs::write(source.path().join(".dayjot/index.sqlite"), b"db").expect("write");
        std::fs::write(source.path().join(".git/HEAD"), b"ref").expect("write");
        std::fs::write(source.path().join(".DS_Store"), b"junk").expect("write");

        let container = tempfile::tempdir().expect("tempdir");
        let target = container.path().join("Notes");
        let copied = copy_graph_tree(source.path(), &target).expect("copy");
        assert_eq!(copied, (1, 3)); // one file, three bytes — the note alone
        assert_eq!(count_graph_tree(&target).expect("count"), copied);
        assert_eq!(
            std::fs::read_to_string(target.join("notes/a.md")).expect("read"),
            "# A"
        );
        assert!(!target.join(".dayjot").exists());
        assert!(!target.join(".git").exists());
        assert!(!target.join(".DS_Store").exists());
    }

    #[cfg(unix)]
    #[test]
    fn a_failed_adopt_cleans_a_fresh_target_so_retries_work() {
        use std::os::unix::fs::PermissionsExt;

        // An unreadable source subdir aborts the copy partway (CI runners
        // and dev machines don't run tests as root).
        let source = tempfile::tempdir().expect("tempdir");
        std::fs::create_dir_all(source.path().join("notes")).expect("mkdir");
        std::fs::write(source.path().join("notes/a.md"), b"# A").expect("write");
        let locked = source.path().join("zz-locked");
        std::fs::create_dir_all(&locked).expect("mkdir");
        std::fs::write(locked.join("f.md"), b"x").expect("write");
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o000)).expect("chmod");

        let container = tempfile::tempdir().expect("tempdir");
        let target = container.path().join("Notes");
        let result = adopt_into(source.path(), &target);

        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o755))
            .expect("chmod back");
        assert!(result.is_err());
        // The half-copied tree is gone — dir_has_notes won't block the retry.
        assert!(!target.exists(), "partial adopt tree left behind");
    }

    #[cfg(unix)]
    #[test]
    fn a_failed_adopt_never_deletes_a_preexisting_folder() {
        use std::os::unix::fs::PermissionsExt;

        let source = tempfile::tempdir().expect("tempdir");
        let locked = source.path().join("zz-locked");
        std::fs::create_dir_all(&locked).expect("mkdir");
        std::fs::write(locked.join("f.md"), b"x").expect("write");
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o000)).expect("chmod");

        // The target already exists with unrelated content (no notes, so the
        // has-notes gate upstream allowed the adopt).
        let container = tempfile::tempdir().expect("tempdir");
        let target = container.path().join("Notes");
        std::fs::create_dir_all(&target).expect("mkdir");
        std::fs::write(target.join("keep.txt"), b"precious").expect("write");

        let result = adopt_into(source.path(), &target);

        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o755))
            .expect("chmod back");
        assert!(result.is_err());
        assert!(
            target.join("keep.txt").exists(),
            "pre-existing content deleted"
        );
    }

    #[test]
    fn dir_has_notes_sees_markdown_and_placeholders() {
        let root = tempfile::tempdir().expect("tempdir");
        assert!(!dir_has_notes(root.path()));

        std::fs::create_dir_all(root.path().join("daily")).expect("mkdir");
        assert!(!dir_has_notes(root.path()));

        std::fs::write(root.path().join("daily/.2026-07-04.md.icloud"), b"stub").expect("write");
        assert!(dir_has_notes(root.path()));

        let downloaded = tempfile::tempdir().expect("tempdir");
        std::fs::create_dir_all(downloaded.path().join("notes")).expect("mkdir");
        std::fs::write(downloaded.path().join("notes/idea.md"), b"# hi").expect("write");
        assert!(dir_has_notes(downloaded.path()));
    }

    #[test]
    fn note_scope_covers_markdown_under_note_dirs_only() {
        // Markdown in the tracked directories (nested included) is in scope.
        assert!(placeholder_in_note_scope(
            Path::new("daily"),
            "2026-07-04.md"
        ));
        assert!(placeholder_in_note_scope(Path::new("notes"), "idea.md"));
        assert!(placeholder_in_note_scope(
            Path::new("templates"),
            "meeting.md"
        ));
        assert!(placeholder_in_note_scope(
            Path::new("notes/archive"),
            "old.md"
        ));
        // Assets, recordings, non-markdown, and root strays wait for the
        // full-scope follow-up request.
        assert!(!placeholder_in_note_scope(Path::new("assets"), "photo.png"));
        assert!(!placeholder_in_note_scope(
            Path::new("audio-memos"),
            "memo.m4a"
        ));
        assert!(!placeholder_in_note_scope(Path::new("notes"), "photo.png"));
        assert!(!placeholder_in_note_scope(Path::new(""), "stray.md"));
    }
}
