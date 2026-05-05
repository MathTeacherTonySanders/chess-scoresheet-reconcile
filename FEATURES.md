# Reconcile — Feature Manifest & Regression Checklist

This document is the durable, authoritative list of agreed features for the Reconcile chess-scoresheet app. It exists so that future UI / layout refactors do not silently drop or hide features. Every PR or refactor MUST verify all items below pass before merge.

If a feature here would be **moved**, **collapsed by default**, or **placed below the fold**, that is a regression. Either keep it visible or get explicit written approval to change its discoverability.

---

## Non-negotiable feature list

### 1. Modes
- [ ] **Verify PGN mode** — reconcile a tournament PGN against a handwritten scoresheet (`data-testid="page-verify"`).
- [ ] **Build PGN mode** — assemble a legal PGN from two transcribed scoresheets, with reviewer notes, validity checks, and PGN export.
- [ ] Mode switcher in the top bar (desktop) AND a separate mobile mode switch are both present and functional.

### 2. Side-by-side workbench layout (desktop, ≥ `lg` breakpoint)
- [ ] Verify mode: scoresheet image pane (left, sticky / independent scroll) is visible at the same time as the workspace pane (right) without forcing page-level scrolling. Test IDs: `verify-image-pane`, `verify-workspace-pane`.
- [ ] Build mode: scoresheet image(s) pane on the left, workspace pane on the right. Test IDs: `build-image-pane`, `build-workspace-pane`.
- [ ] Each pane has its own internal scroll; comparing image vs PGN/table never requires scrolling the whole page.

### 3. Interactive chess board viewer — MUST be clearly visible
- [ ] Board renders in **both** Verify and Build modes (`data-testid="verify-board-container"`, `data-testid="build-board-container"`).
- [ ] Step controls: First, Prev, Next, Last (`button-board-start`, `button-board-prev`, `button-board-next`, `button-board-end`).
- [ ] Clickable move chips that jump to a specific ply.
- [ ] Last-move highlight on the board.
- [ ] Keyboard: ←/→ step, Home/End jump to ends.
- [ ] Note-bearing plies show a visual marker (dot) on their move chip.
- [ ] **Discoverability**: Board card must be visible at the top of the workspace pane on initial load — open by default. Collapsing is allowed as an option, but not the default state.

### 4. Per-ply reviewer notes — MUST be clearly visible
- [ ] Note editor present in **both** Verify and Build (`data-testid="card-note-editor"`, `textarea-note`).
- [ ] Editor is tied to the current ply (`note-current-context` reflects `<move>… · ply N`).
- [ ] Notes survive ply navigation within a game and are isolated per game (Verify) / per accepted line (Build).
- [ ] Header shows a count badge (`badge-notes-count-header`, `badge-build-notes-count-header`).
- [ ] No persistence to localStorage / sessionStorage / indexedDB / cookies — React state only. This is intentional (sandbox compatibility).

### 5. Inline note extraction (`--` syntax)
- [ ] Transcription textarea accepts `--` markers, e.g. `4. Nxe4 Nf6 -- Player typo 4w wrote Nxd4. 4b wrote Nc6`.
- [ ] Helper text under the textarea explains the syntax (`helper-inline-notes`).
- [ ] "Extract inline notes" button (`button-extract-inline-notes`) opens a review dialog (`dialog-inline-notes-review`).
- [ ] In the dialog the reviewer can edit, retarget, skip, or apply each detected note; applied notes are merged into the ply note for the chosen game.
- [ ] After apply, a "cleanup applied" affordance removes the `--` markers from the source text (`button-cleanup-applied`).

### 6. Discrepancy table & exports (Verify)
- [ ] Discrepancy / comparison table renders with PGN move, transcribed move, and status per ply.
- [ ] Active row highlighted, click jumps the board to that ply (`onJumpToPly`).
- [ ] Reviewer-note column shown when notes are present.
- [ ] Summary strip with totals (matches / mismatches / illegible / missing / extra / illegal sheet).
- [ ] Compact / Comfortable density toggle (`button-toggle-compact`).
- [ ] Exports: Copy Markdown (`button-copy-markdown`), CSV download (`button-download-csv`), Markdown download (`button-download-markdown`). Reviewer notes MUST be included in MD and CSV outputs.

### 7. Build mode accepted-line workflow
- [ ] Per-ply rows comparing White and Black transcriptions.
- [ ] Accept-from-White / Accept-from-Black / Use-typed for each row.
- [ ] Seed buttons: Seed White, Seed Black, Prefer agree (`button-seed-white`, `button-seed-black`, `button-seed-both`).
- [ ] Clear accepted (`button-clear-accepted`).
- [ ] Legality validation against `chess.js`: rows that would produce an illegal position are flagged.
- [ ] Live PGN preview (`text-pgn-preview`).
- [ ] Exports: Copy PGN (`button-copy-pgn`), Download PGN (`button-download-pgn`), Issues MD (`button-download-issue-md`), Issues CSV (`button-download-issue-csv`).

### 8. Theming, accessibility, and constraints
- [ ] Dark mode toggle in the top bar (`button-theme-toggle`). Theme is `prefers-color-scheme` seeded; no localStorage persistence.
- [ ] Responsive layout (≥ 375 px mobile, lg+ side-by-side).
- [ ] No claims of OCR anywhere in the UI. The amber disclaimer banner is visible in both modes.
- [ ] No use of localStorage, sessionStorage, IndexedDB, or cookies anywhere in the client.

---

## Manual regression checklist (run before any deploy)

1. Open Verify mode at desktop width (≥ 1280 px). Confirm:
   - Scoresheet image is visible on the left.
   - On the right, the **Chess board & reviewer notes** card is visible above the fold, expanded.
   - The **Discrepancy report** table is visible after a short pane scroll.
   - Page itself does not scroll — only the workspace pane.
2. Click a move chip on the board → board updates, last-move highlight changes, note editor's "current ply" line updates.
3. Type "test note" into the note editor → header notes-count badge increments.
4. Paste a transcription with a `-- comment` marker, click **Extract inline notes**, apply → note is merged into the chosen ply.
5. Click **Copy Markdown** with notes present → clipboard contains a Reviewer Notes section.
6. Switch to Build mode → confirm the **Chess board & reviewer notes** card is visible above the accepted-line table.
7. Seed accepted line → board populates → step through plies, attach a note.
8. Click **Copy PGN** and **Issues (CSV)** → both produce non-empty output reflecting the accepted line + notes.
9. Toggle dark mode → all panes adapt; no missing colors.
10. Resize to 375 px → panes stack, board+notes still present.

## Automated checks

See `client/tests/regression.spec.ts` for the Playwright smoke test. It asserts presence of the core test IDs listed above. Run via `npx playwright test` after `npm run dev`.

---

## Known intentional non-features

- No data persistence between sessions (sandbox limitation).
- No OCR — handwriting recognition is not part of this app.
- No engine analysis or evaluation bar.
