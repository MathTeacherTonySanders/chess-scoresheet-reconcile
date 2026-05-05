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

    // Accepted-line workflow.
    await expectVisible(page, 'build-comparison-block');
    for (const id of ['button-seed-white', 'button-seed-black', 'button-seed-both']) {
      await expectVisible(page, id);
    }

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

    // Functional: seed from white sheet, confirm board controls render after a legal line is accepted.
    await page.locator('[data-testid="textarea-sheet-white"]').fill('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6');
    await page.locator('[data-testid="button-seed-white"]').click();
    await expect(page.locator('[data-testid="board-controls"]')).toBeVisible();
    await expect(page.locator('[data-testid="button-board-next"]')).toBeVisible();

    // Step forward and attach a build note.
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-testid="textarea-build-note"]')).toBeEnabled();
    await page.locator('[data-testid="textarea-build-note"]').fill('build regression note');
    await expect(page.locator('[data-testid="badge-build-notes-count-header"]')).toContainText('1');
  });
});
