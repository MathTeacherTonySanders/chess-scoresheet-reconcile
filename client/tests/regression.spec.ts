/**
 * Reconcile regression smoke test.
 *
 * Asserts that the agreed non-negotiable features (FEATURES.md) are present and
 * minimally functional in both Verify and Build modes after any UI refactor.
 *
 * Usage (requires Playwright installed locally):
 *   npm i -D @playwright/test
 *   npx playwright install chromium
 *   # In one terminal:
 *   npm run dev      # or: npm run build && npm start
 *   # In another:
 *   npx playwright test client/tests/regression.spec.ts
 *
 * Override the URL via BASE_URL=http://… npx playwright test
 */
import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000/';

async function expectVisible(page: Page, testId: string) {
  await expect(page.locator(`[data-testid="${testId}"]`).first(), `missing test id: ${testId}`).toBeVisible();
}

/** Resolve the on-page top of a `data-testid` element via bounding box. */
async function topOf(page: Page, testId: string): Promise<number> {
  const box = await page.locator(`[data-testid="${testId}"]`).first().boundingBox();
  if (!box) throw new Error(`no bounding box for [data-testid="${testId}"]`);
  return box.y;
}

test.describe('Reconcile regression — Verify mode', () => {
  test('side-by-side panes, chess board, note editor, exports, and inline note helper are all present', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Mode entry point.
    await expectVisible(page, 'page-verify');

    // Side-by-side layout panes.
    await expectVisible(page, 'verify-image-pane');
    await expectVisible(page, 'verify-workspace-pane');

    // Chess board card visible at top of workspace pane (not collapsed).
    const boardCard = page.locator('[data-testid="card-board-collapsible"]').first();
    await expect(boardCard).toBeVisible();
    const cardBox = await boardCard.boundingBox();
    expect(cardBox, 'board card should have non-zero height').not.toBeNull();
    expect(cardBox!.height, 'board card collapsed/squashed').toBeGreaterThan(200);

    await expectVisible(page, 'verify-board-container');
    await expectVisible(page, 'chess-board');
    await expectVisible(page, 'board-controls');
    for (const id of ['button-board-start', 'button-board-prev', 'button-board-next', 'button-board-end']) {
      await expectVisible(page, id);
    }

    // Note editor visible.
    await expectVisible(page, 'verify-note-container');
    await expectVisible(page, 'card-note-editor');
    await expectVisible(page, 'textarea-note');
    await expectVisible(page, 'badge-notes-count-header');

    // Transcription editor + inline note helper.
    await expectVisible(page, 'card-transcription');
    await expectVisible(page, 'textarea-transcription');
    await expectVisible(page, 'helper-inline-notes');
    await expectVisible(page, 'button-extract-inline-notes');

    // Discrepancy table + exports.
    await expectVisible(page, 'verify-comparison-block');
    await expectVisible(page, 'button-copy-markdown');
    await expectVisible(page, 'button-download-csv');
    await expectVisible(page, 'button-download-markdown');

    // Functional: stepping the board enables the note editor, which is the per-ply binding.
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-testid="textarea-note"]')).toBeEnabled();
    await page.locator('[data-testid="textarea-note"]').fill('regression note');
    await expect(page.locator('[data-testid="badge-notes-count-header"]')).toContainText('1');

    // Inline note extraction button activates with `--` markers.
    await page.locator('[data-testid="textarea-transcription"]')
      .fill('1. e4 e5 -- reviewer note about move 1\n2. Nf3 Nc6');
    await expect(page.locator('[data-testid="button-extract-inline-notes"]')).toBeEnabled();
  });
});

test.describe('Approved layout DOM order', () => {
  test('Verify mode: workbench (image | PGN/discrepancy) sits above board which sits above notes', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await expectVisible(page, 'page-verify');

    // Required sections present.
    for (const id of [
      'verify-workbench',
      'verify-image-pane',
      'verify-workspace-pane',
      'verify-comparison-block',
      'verify-board-section',
      'verify-board-container',
      'verify-notes-section',
      'verify-note-container',
    ]) {
      await expectVisible(page, id);
    }

    // The discrepancy/PGN block lives INSIDE the right workspace pane, not below the board.
    const workspacePaneHasComparison = await page
      .locator('[data-testid="verify-workspace-pane"] [data-testid="verify-comparison-block"]')
      .count();
    expect(workspacePaneHasComparison, 'discrepancy table must live inside the right workspace pane').toBe(1);

    // Vertical order: workbench < board section < notes section.
    const yWorkbench = await topOf(page, 'verify-workbench');
    const yBoard = await topOf(page, 'verify-board-section');
    const yNotes = await topOf(page, 'verify-notes-section');
    expect(yWorkbench).toBeLessThan(yBoard);
    expect(yBoard).toBeLessThan(yNotes);

    // The board must NOT sit above the discrepancy table (which is the regression we are guarding against).
    const yComparison = await topOf(page, 'verify-comparison-block');
    expect(yBoard, 'board section must be BELOW the discrepancy/PGN table on desktop').toBeGreaterThan(yComparison);
  });

  test('Build mode: workbench (images | accepted-line table) sits above board which sits above notes/exports', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.locator('[data-testid="button-mode-build"]').click({ force: true });
    await expectVisible(page, 'page-build');

    for (const id of [
      'build-workbench',
      'build-image-pane',
      'build-workspace-pane',
      'build-comparison-block',
      'build-board-section',
      'build-board-container',
      'build-notes-export-section',
      'build-note-container',
      'build-export-block',
    ]) {
      await expectVisible(page, id);
    }

    // Accepted-line table lives inside the right workspace pane.
    const workspacePaneHasComparison = await page
      .locator('[data-testid="build-workspace-pane"] [data-testid="build-comparison-block"]')
      .count();
    expect(workspacePaneHasComparison, 'accepted-line table must live inside the right workspace pane').toBe(1);

    const yWorkbench = await topOf(page, 'build-workbench');
    const yBoard = await topOf(page, 'build-board-section');
    const yNotesExport = await topOf(page, 'build-notes-export-section');
    expect(yWorkbench).toBeLessThan(yBoard);
    expect(yBoard).toBeLessThan(yNotesExport);

    const yAccepted = await topOf(page, 'build-comparison-block');
    expect(yBoard, 'board section must be BELOW the accepted-line table on desktop').toBeGreaterThan(yAccepted);
  });
});

test.describe('Reconcile regression — Build mode', () => {
  test('side-by-side panes, chess board, note editor, accepted-line, and PGN exports are all present', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.locator('[data-testid="button-mode-build"]').click({ force: true });

    await expectVisible(page, 'page-build');
    await expectVisible(page, 'build-image-pane');
    await expectVisible(page, 'build-workspace-pane');

    const buildBoardCard = page.locator('[data-testid="card-build-board"]').first();
    await expect(buildBoardCard).toBeVisible();
    expect((await buildBoardCard.boundingBox())!.height, 'build board card collapsed').toBeGreaterThan(200);

    await expectVisible(page, 'build-board-container');
    await expectVisible(page, 'build-note-container');
    await expectVisible(page, 'textarea-build-note');
    await expectVisible(page, 'badge-build-notes-count-header');

    // Accepted-line workflow — single working transcription, single seed button.
    await expectVisible(page, 'build-comparison-block');
    await expectVisible(page, 'button-seed-accepted');
    await expectVisible(page, 'textarea-working-transcription');
    await expectVisible(page, 'helper-working-transcription');

    // PGN exports.
    for (const id of [
      'button-copy-pgn',
      'button-download-pgn',
      'button-download-issue-md',
      'button-download-issue-csv',
      'text-pgn-preview',
    ]) {
      await expectVisible(page, id);
    }

    // Session export / import controls.
    for (const id of [
      'build-session-block',
      'button-export-session',
      'button-import-session',
      'input-session-import',
    ]) {
      await expectVisible(page, id);
    }

    // Functional: seed accepted line from the working transcription, confirm board controls render.
    await page.locator('[data-testid="textarea-working-transcription"]').fill('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6');
    await page.locator('[data-testid="button-seed-accepted"]').click();
    await expect(page.locator('[data-testid="board-controls"]')).toBeVisible();
    await expect(page.locator('[data-testid="button-board-next"]')).toBeVisible();

    // Step forward and attach a build note.
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-testid="textarea-build-note"]')).toBeEnabled();
    await page.locator('[data-testid="textarea-build-note"]').fill('build regression note');
    await expect(page.locator('[data-testid="badge-build-notes-count-header"]')).toContainText('1');
  });
});
