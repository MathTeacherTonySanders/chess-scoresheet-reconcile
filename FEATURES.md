# Reconcile — Feature Manifest & Regression Checklist

This document is the durable, authoritative list of agreed features for the Reconcile chess-scoresheet app. It exists so that future UI / layout refactors do not silently drop or hide features. Every PR or refactor MUST verify all items below pass before merge.

If a feature here would be **moved**, **collapsed by default**, or **placed below the fold**, that is a regression. Either keep it visible or get explicit written approval to change its discoverability.

---

## Approved layout hierarchy (do NOT regress)

The layout below is the **approved** structure that the user signed off on. Future agents must NOT re-stack the chess board or per-ply notes above the PGN/transcription/discrepancy table on desktop. Doing so makes the board and notes "in the way" of the primary proofreading task. Tests in `client/tests/regression.spec.ts` enforce DOM order — see the `Approved layout DOM order` describe block.

### Verify mode — desktop (≥ `lg` breakpoint)

```
┌─ sidebar ─┬────────────────── main ────────────────────┐
│          │ disclaimer banner                                  │
│          │ ┌─ 1. TOP WORKBENCH (verify-workbench) ────────┐ │
│ sources  │ │  scoresheet image  │  transcription editor  │ │
│ (sticky) │ │  (verify-image-    │  + discrepancy report  │ │
│          │ │   pane)            │  (verify-workspace-    │ │
│          │ │                    │   pane)                │ │
│          │ └─────────────────────────────────────────────┘ │
│          │ ┌─ 2. INTERACTIVE BOARD (verify-board-section) ──┐ │
│          │ │  full-width chess board                        │ │
│          │ └─────────────────────────────────────────────┘ │
│          │ ┌─ 3. PER-PLY REVIEWER NOTES (verify-notes-section) ┐ │
│          │ │  per-ply note editor for the current ply       │ │
│          │ └─────────────────────────────────────────────┘ │
└──────────┴────────────────────────────────────────────────────┘
```

- **Top workbench** (`verify-workbench`): two side-by-side panes — `verify-image-pane` (left) and `verify-workspace-pane` (right). The right pane contains the transcription editor (`card-transcription`) and the discrepancy report (`verify-comparison-block`). The image pane is sticky on desktop so it stays visible while the right column scrolls.
- **Below the workbench**: the interactive chess board (`verify-board-section` → `verify-board-container`).
- **Below the board**: the per-ply reviewer notes editor (`verify-notes-section` → `verify-note-container`, `card-note-editor`).
- The page itself scrolls. Do **not** reintroduce a viewport-locked workspace pane that hides the discrepancy table behind a board card.

### Build mode — desktop (≥ `lg` breakpoint)

```
┌─ sidebar ─┬────────────────── main ────────────────────┐
│          │ build banner                                       │
│          │ ┌─ 1. TOP WORKBENCH (build-workbench) ─────────┐ │
│ sources  │ │  scoresheet images │  transcriptions +      │ │
│ + meta   │ │  (toggle/split,    │  accepted-line table   │ │
│ (sticky) │ │   build-image-     │  (build-comparison-    │ │
│          │ │   pane)            │   block)               │ │
│          │ └─────────────────────────────────────────────┘ │
│          │ ┌─ 2. BOARD FOR ACCEPTED LINE (build-board-section) ┐ │
│          │ │  full-width board over the accepted line       │ │
│          │ └─────────────────────────────────────────────┘ │
│          │ ┌─ 3. NOTES + EXPORTS (build-notes-export-section) ─┐ │
│          │ │  per-ply notes  |  PGN/issue export workspace  │ │
│          │ └─────────────────────────────────────────────┘ │
└──────────┴────────────────────────────────────────────────────┘
```

- **Top workbench** (`build-workbench`): `build-image-pane` (left) and `build-workspace-pane` (right). The right pane contains the sheet transcriptions (`card-build-transcriptions`) and the accepted-line table (`build-comparison-block`).
- **Below the workbench**: the interactive chess board for the accepted line (`build-board-section` → `build-board-container`).
- **Below the board**: notes + issues/PGN export workspace (`build-notes-export-section` → `card-build-notes-wrapper` and `build-export-block`).
- Notes/exports must NEVER be stacked above the accepted-line table on desktop.

### Mobile / tablet (< `lg` breakpoint)

Panes may stack vertically. The DOM order is preserved (workbench first, board second, notes/exports last) so reading order remains coherent.

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
- [ ] **Position in layout**: Board section appears **below** the top workbench and **above** the per-ply notes section. The board card is open by default; collapsing is allowed as an option but not the default. The board MUST NOT be placed above the PGN/transcription/accepted-line table on desktop — see `Approved layout hierarchy` above.

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
- [ ] **Single working transcription** input (`textarea-working-transcription`, label "Scoresheet transcription"). The reviewer visually compares the two scoresheet images and enters the decided move sequence here — there is no separate Black-side transcription. Helper text explains the visual-comparison workflow (`helper-working-transcription`).
- [ ] Per-ply rows showing the working transcription, accepted move, status, and per-row actions.
- [ ] **Accept all transcribed moves** button (`button-seed-accepted`, label "Accept all transcribed moves") populates the accepted line in one click from every parsable move in the working transcription. The `data-testid` is preserved as `button-seed-accepted` for regression compatibility. Per-row `Use` button copies the transcribed token into the accepted slot (`button-use-working-{ply}`).
- [ ] Clear accepted (`button-clear-accepted`).
- [ ] Legality validation against `chess.js`: rows that would produce an illegal position are flagged.
- [ ] Per-ply statuses: legal, illegible, illegal, blocked, blank (summary strip `strip-build-summary`). No dual-sheet "conflicts" tally — there is only one transcription.
- [ ] Live PGN preview (`text-pgn-preview`).
- [ ] Exports: Copy PGN (`button-copy-pgn`), Download PGN (`button-download-pgn`), Issues MD (`button-download-issue-md`), Issues CSV (`button-download-issue-csv`).

### 7b. Build mode session export / import (file-based persistence)
- [ ] **Export session** button (`button-export-session`) downloads a JSON file (`reconcile-session-YYYY-MM-DD-...json`) containing the current Build state: selected sample, active page, image/page layout switches, active sheet, PGN metadata, working transcription, accepted-line edits, per-ply reviewer notes, current board ply, plus an app/version marker (`app: "reconcile"`, `version: 2`) and ISO timestamp.
- [ ] **Import session** button (`button-import-session`) and a hidden file input (`input-session-import`) accept a JSON file and restore the saved state into Build mode. Invalid / unsupported files surface a clear toast error (wrong `app`, unsupported version, malformed JSON).
- [ ] **Copy session JSON** button (`button-copy-session`) copies the same payload to the clipboard for inline sharing.
- [ ] The session block (`build-session-block`) lives below the chess board, alongside the PGN/issue export panel in the notes-export-section. It does NOT change the approved layout hierarchy.
- [ ] Forward-compatible: v1 (two-sheet) session files load with their `whiteText` mapped onto the working transcription so older saves still resume.
- [ ] File-based only. No localStorage / sessionStorage / IndexedDB / cookies are used by import or export.

### 8. Theming, accessibility, and constraints
- [ ] Dark mode toggle in the top bar (`button-theme-toggle`). Theme is `prefers-color-scheme` seeded; no localStorage persistence.
- [ ] Responsive layout (≥ 375 px mobile, lg+ side-by-side).
- [ ] No claims of OCR anywhere in the UI. The amber disclaimer banner is visible in both modes.
- [ ] No use of localStorage, sessionStorage, IndexedDB, or cookies anywhere in the client.

---

## Manual regression checklist (run before any deploy)

1. Open Verify mode at desktop width (≥ 1280 px). Confirm:
   - Scoresheet image is visible on the left of the top workbench.
   - On the right of the top workbench, the **transcription editor** AND the **Discrepancy report** are visible (the right pane is the proofreading partner of the image — board/notes are NOT in here).
   - Scrolling down brings the **interactive chess board** into view.
   - Scrolling further brings the **per-ply reviewer notes** editor into view.
2. Click a move chip on the board → board updates, last-move highlight changes, note editor's "current ply" line updates.
3. Type "test note" into the note editor → header notes-count badge increments.
4. Paste a transcription with a `-- comment` marker, click **Extract inline notes**, apply → note is merged into the chosen ply.
5. Click **Copy Markdown** with notes present → clipboard contains a Reviewer Notes section.
6. Switch to Build mode → confirm the order: top workbench (images | working transcription + accepted-line table), then board below, then notes + PGN/issue exports + session block below the board. There is **one** transcription input, not two.
7. Pick the Jeff Martin vs Stephen Jablon sample, toggle between Page 1 / Page 2 and Stack pages — image swaps and metadata is pre-filled.
8. Type `1. e4 e5 2. Nf3 Nc6` into the working transcription → click **Accept all transcribed moves** → board populates → step through plies, attach a per-ply note.
9. Click **Copy PGN** and **Issues (CSV)** → both produce non-empty output reflecting the accepted line + notes.
10. Click **Export session** → a `reconcile-session-...json` file downloads. Change the working transcription / clear the accepted line / delete the note. Click **Import session** and pick the same file → the sample, page layout, metadata, working transcription, accepted line, current ply, and per-ply note are all restored. PGN export still works after import.
11. Toggle dark mode → all panes adapt; no missing colors.
12. Resize to 375 px → panes stack in DOM order (workbench → board → notes/exports/session).

## Automated checks

See `client/tests/regression.spec.ts` for the Playwright smoke test. It asserts presence of the core test IDs listed above. Run via `npx playwright test` after `npm run dev`.

---

## Multi-page scoresheet samples (Build mode)

Some built-in Build PGN samples are **multi-page** — a single game whose move list runs across two scoresheet pages because it exceeded the 50-move single-sheet capacity. Currently:

- `Bd 1 — Jeff Martin (1980) vs Stephen Jablon (2033), 0-1, pg 1/2` (sample id `7`, button `button-build-sample-7`).

When a multi-page sample is assigned to the active sheet, the image pane MUST expose:

- A **Page 1 / Page 2 / …** toggle (`button-page-1`, `button-page-2`, …) so the reviewer can flip between pages without losing the active White/Black sheet selection.
- A **One page / Stack pages** layout switch (`button-page-layout-toggle`, `button-page-layout-stack`). Stack mode renders all pages of the active sheet vertically (`card-build-image-stack`, `card-build-image-page-1`, `card-build-image-page-2`, …) for side-by-side reading without losing context.
- A page badge (`pg N/M`) and an eyebrow showing `Page N of M` so the reviewer always knows which page is on screen.

The page controls are nested inside the existing **left** column of the build workbench and MUST NOT alter the approved layout hierarchy (workbench → board → notes/exports). The existing **White / Black** sheet toggle and the existing **Toggle / Split** image layout for two-player sheet pairs continue to work unchanged — multi-page is orthogonal to the per-sheet selector. Single-page samples render exactly as before with no page controls visible.

Multi-page samples MAY also carry pre-filled `meta` (Board, White, Black, WhiteElo, BlackElo, Result). Selecting such a sample populates the corresponding metadata fields in the sidebar; Date/Site/Event remain editable and are not overwritten.

### Regression test for page toggles

1. Open Build mode at desktop width.
2. Click the multi-page sample in the left rail (e.g. `Bd 1 — Jeff Martin… pg 1/2`).
3. Verify that the page-controls row appears with `Page 1` and `Page 2` buttons and a `One page / Stack pages` switch.
4. Verify metadata is populated: White = `Jeff Martin`, Black = `Stephen Jablon`, WhiteElo = `1980`, BlackElo = `2033`, Board = `1`, Result = `0-1`.
5. Click `Page 2` → the image swaps to the second page; the badge reads `pg 2/2`.
6. Click `Stack pages` → both pages render vertically inside the left column; the active page is ring-highlighted; clicking either card sets it active.
7. Click `One page` then switch sheets to Black and pick a different (single-page) sample → page controls disappear (no multi-page state).
8. Click `Split` (image layout) → White / Black sheet cards both render (single-page behaviour). Click `Toggle` to return.
9. Seed an accepted line → the chess board below the workbench updates with the played plies.
10. Confirm DOM order is still: `build-workbench` → `build-board-section` → `build-notes-export-section`.

## Known intentional non-features

- No data persistence between sessions (sandbox limitation).
- No OCR — handwriting recognition is not part of this app. Multi-page samples are loaded as static JPEGs; the user still transcribes the moves manually.
- No engine analysis or evaluation bar.
