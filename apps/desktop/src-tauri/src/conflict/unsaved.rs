//! An open note's unsaved edits meet an external change (a sync pull, another
//! app, another window): fold both into one note without dropping either.
//!
//! The editor knows all three versions — the content it last read or wrote
//! (the common ancestor), its buffer (ours), and what is on disk now
//! (theirs) — so the merge is a true three-way one:
//!
//! 1. **Three-way merge** — disjoint edits combine cleanly.
//! 2. **Append-union** — both sides only *added* to the ancestor (the
//!    daily-note shape: two devices jotting into the same day, or both
//!    creating it): keep the ancestor and both additions, theirs first and
//!    ours last — ours is what the user is typing right now, so their caret
//!    stays at the end of their own text. Unlike the iCloud ladder's rule,
//!    this one checks the ancestor, so it never fires on a real edit.
//! 3. **Markers** — overlapping edits, labeled like a Git pull's conflicts,
//!    for the review view to resolve.
//!
//! Unlike the iCloud ladder, nothing here needs to be deterministic across
//! devices: only this device holds the unsaved side.

use serde::Serialize;

use crate::error::AppResult;
use crate::git::{OUR_LABEL, THEIR_LABEL};

use super::markers::contains_conflict_markers;
use super::merge3::{diff3, Diff3Outcome};
use super::union::append_union;
use super::ConflictSide;

/// The merged note. `Conflicted` content carries conflict markers and must be
/// resolved in the review view, never loaded into an editor.
#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum UnsavedMerge {
    Merged { content: String },
    Conflicted { content: String },
}

/// Merge `ours` (the unsaved buffer) and `theirs` (the file now on disk) over
/// `base` (what the editor last read or wrote).
pub fn merge_unsaved(base: &str, ours: &str, theirs: &str) -> AppResult<UnsavedMerge> {
    let our_side = side(ours, OUR_LABEL);
    let their_side = side(theirs, THEIR_LABEL);
    let marked = match diff3(base, &our_side, &their_side)? {
        Diff3Outcome::Clean(content) => return Ok(UnsavedMerge::Merged { content }),
        Diff3Outcome::Conflicted(content) => content,
    };
    if appends_to(base, ours) && appends_to(base, theirs) {
        if let Some(content) = append_union(theirs, ours) {
            return Ok(UnsavedMerge::Merged { content });
        }
    }
    if contains_conflict_markers(theirs) {
        // The file already holds a conflict (a pull merged it with markers):
        // hunk markers around those would nest, which the marker grammar can't
        // express. Keep it verbatim and add the unsaved buffer as a block of
        // its own — nothing is dropped, and the review view resolves it.
        return Ok(UnsavedMerge::Conflicted {
            content: format!(
                "{}\n<<<<<<< {OUR_LABEL}\n{}\n=======\n>>>>>>> {THEIR_LABEL}\n",
                theirs.trim_end_matches('\n'),
                ours.trim_end_matches('\n'),
            ),
        });
    }
    Ok(UnsavedMerge::Conflicted { content: marked })
}

/// Merge an open note's unsaved edits with an external change (see
/// [`merge_unsaved`]). Pure text — no graph access.
#[tauri::command]
pub fn note_merge_unsaved(base: String, ours: String, theirs: String) -> AppResult<UnsavedMerge> {
    merge_unsaved(&base, &ours, &theirs)
}

fn side(content: &str, label: &str) -> ConflictSide {
    ConflictSide {
        content: content.to_string(),
        label: label.to_string(),
        modified_ms: 0,
    }
}

/// True when `content` is `base` plus lines added after it (trailing blank
/// lines of `base` don't count) — an append, not an edit.
fn appends_to(base: &str, content: &str) -> bool {
    let mut base_lines: Vec<&str> = base.split('\n').collect();
    while base_lines.last().is_some_and(|line| line.trim().is_empty()) {
        base_lines.pop();
    }
    let lines: Vec<&str> = content.split('\n').collect();
    lines.len() >= base_lines.len() && lines[..base_lines.len()] == base_lines[..]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn merged(content: &str) -> UnsavedMerge {
        UnsavedMerge::Merged {
            content: content.to_string(),
        }
    }

    #[test]
    fn serializes_to_the_ipc_shape_the_frontend_parses() {
        // `unsavedMergeSchema` in @dayjot/core: `{ kind, content }`.
        assert_eq!(
            serde_json::to_value(merged("a\n")).unwrap(),
            serde_json::json!({ "kind": "merged", "content": "a\n" }),
        );
        let conflicted = UnsavedMerge::Conflicted {
            content: "x".to_string(),
        };
        assert_eq!(
            serde_json::to_value(conflicted).unwrap(),
            serde_json::json!({ "kind": "conflicted", "content": "x" }),
        );
    }

    #[test]
    fn disjoint_edits_merge_cleanly() {
        let base = "# Note\n\nfirst\nmiddle\nlast\n";
        let ours = "# Note\n\nfirst\nmiddle\nlast, edited here\n";
        let theirs = "# Note\n\nfirst, edited there\nmiddle\nlast\n";
        assert_eq!(
            merge_unsaved(base, ours, theirs).unwrap(),
            merged("# Note\n\nfirst, edited there\nmiddle\nlast, edited here\n"),
        );
    }

    #[test]
    fn both_devices_appending_to_a_daily_note_keeps_both_theirs_first() {
        let base = "早上：开会\n";
        let ours = "早上：开会\n晚上：跑步\n";
        let theirs = "早上：开会\n下午：买菜\n";
        assert_eq!(
            merge_unsaved(base, ours, theirs).unwrap(),
            merged("早上：开会\n下午：买菜\n晚上：跑步\n"),
        );
    }

    #[test]
    fn both_creating_the_same_note_keeps_both() {
        // A lazy daily note: nothing on disk when the editor opened it.
        assert_eq!(
            merge_unsaved("", "- from this mac\n", "- from the laptop\n").unwrap(),
            merged("- from the laptop\n- from this mac\n"),
        );
    }

    #[test]
    fn an_unchanged_side_takes_the_other() {
        let base = "a\n";
        assert_eq!(
            merge_unsaved(base, "a\nb\n", base).unwrap(),
            merged("a\nb\n")
        );
        assert_eq!(
            merge_unsaved(base, base, "a\nc\n").unwrap(),
            merged("a\nc\n")
        );
    }

    #[test]
    fn overlapping_edits_are_marked_with_the_sync_labels() {
        let base = "下午：买菜\n";
        let ours = "下午：去超市\n";
        let theirs = "下午：买菜和水果\n";
        let UnsavedMerge::Conflicted { content } = merge_unsaved(base, ours, theirs).unwrap()
        else {
            panic!("expected a conflict");
        };
        assert!(
            content.contains("<<<<<<< this device\n下午：去超市\n"),
            "{content}"
        );
        assert!(
            content.contains("下午：买菜和水果\n>>>>>>> other device\n"),
            "{content}"
        );
        assert!(contains_conflict_markers(&content));
    }

    #[test]
    fn an_edit_on_one_side_never_unions_into_a_duplicate() {
        // Ours rewrote a line, theirs appended: not both appends, so the union
        // (which would keep the old line too) must not apply.
        let base = "- a\n- b\n";
        let ours = "- a\n- B\n";
        let theirs = "- a\n- b\n- c\n";
        let content = match merge_unsaved(base, ours, theirs).unwrap() {
            UnsavedMerge::Merged { content } | UnsavedMerge::Conflicted { content } => content,
        };
        assert!(content.contains("- B"), "{content}");
        assert!(content.contains("- c"), "{content}");
        let resolved_ours: Vec<&str> = content.lines().filter(|line| *line == "- b").collect();
        assert!(
            resolved_ours.len() <= 1,
            "the replaced line must not be duplicated: {content}"
        );
    }

    #[test]
    fn a_file_already_in_conflict_gets_the_buffer_as_its_own_block() {
        let base = "早上：开会\n晚上\n";
        let theirs =
            "早上：开会\n<<<<<<< this device\n晚上\n=======\n下午：买菜\n>>>>>>> other device\n";
        let ours = "早上：开会\n晚上：跑步\n";
        let UnsavedMerge::Conflicted { content } = merge_unsaved(base, ours, theirs).unwrap()
        else {
            panic!("expected a conflict");
        };
        assert_eq!(
            content,
            format!(
                "{}<<<<<<< this device\n早上：开会\n晚上：跑步\n=======\n>>>>>>> other device\n",
                theirs
            ),
        );
    }
}
