// The shared editor on its own: the starting tool, the right-click menu and Save as PDF.
const { test, expect } = require('@playwright/test');

async function open(page, query = '') {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/tests/fixtures/editor.html' + query);
  await page.waitForFunction(() => window.ed);
  return page.locator('.se-canvas');
}

async function drawBox(page, canvas) {
  await page.locator('button[data-tool="rect"]').click();
  const b = await canvas.boundingBox();
  await page.mouse.move(b.x + 200, b.y + 150);
  await page.mouse.down();
  await page.mouse.move(b.x + 400, b.y + 300, { steps: 5 });
  await page.mouse.up();
  return b;
}

test('starts on the tool it is given', async ({ page }) => {
  await open(page, '?tool=select');
  await expect(page.locator('button[data-tool="select"]')).toHaveAttribute('aria-pressed', 'true');
  await open(page);
  await expect(page.locator('button[data-tool="arrow"]')).toHaveAttribute('aria-pressed', 'true');
});

test('right-click opens a menu at the pointer', async ({ page }) => {
  const canvas = await open(page);
  const b = await canvas.boundingBox();
  await page.mouse.click(b.x + 300, b.y + 250, { button: 'right' });
  const menu = page.locator('.se-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem')).toHaveText([/Copy/, /Save as PNG/, /Save as PDF/, /Undo/, /Redo/, /Fit to the window/]);
  await expect(menu.getByRole('menuitem', { name: /Undo/ })).toBeDisabled();
  // it opens where the pointer is
  const m = await menu.boundingBox();
  expect(Math.abs(m.x - (b.x + 300))).toBeLessThan(2);
  expect(Math.abs(m.y - (b.y + 250))).toBeLessThan(2);
  // the first item has focus, arrows move, Esc closes
  await expect(menu.getByRole('menuitem', { name: /Copy/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: /Save as PNG/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  // a click elsewhere closes it too
  await page.mouse.click(b.x + 300, b.y + 250, { button: 'right' });
  await expect(menu).toBeVisible();
  await page.mouse.click(b.x + 600, b.y + 500);
  await expect(menu).toBeHidden();
});

test('right-click on a mark offers to delete it', async ({ page }) => {
  const canvas = await open(page, '?tool=select');
  const b = await drawBox(page, canvas);
  expect(await page.evaluate(() => ed.shapes.length)).toBe(1);
  await page.mouse.click(b.x + 200, b.y + 220, { button: 'right' });   // on the box's left edge
  const del = page.locator('.se-menu').getByRole('menuitem', { name: /Delete this mark/ });
  await expect(del).toBeVisible();
  await expect(page.locator('.se-menu').getByRole('menuitem', { name: /Undo/ })).toBeEnabled();
  await del.click();
  expect(await page.evaluate(() => ed.shapes.length)).toBe(0);
});

test('Save as PDF makes a valid PDF with A4-wide pages', async ({ page }) => {
  const canvas = await open(page, '?h=3200');   // 1280 x 3200: two pages
  await drawBox(page, canvas);
  const b = await canvas.boundingBox();
  await page.mouse.click(b.x + 600, b.y + 500, { button: 'right' });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.se-menu').getByRole('menuitem', { name: 'Save as PDF' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('swoop-test.pdf');
  const fs = require('node:fs');
  const pdf = fs.readFileSync(await download.path());
  const text = pdf.toString('latin1');
  expect(text.startsWith('%PDF-1.4')).toBe(true);
  expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  expect(text).toContain('/Count 2');
  expect((text.match(/\/Subtype \/Image/g) || []).length).toBe(2);
  expect(text).toContain('/MediaBox [0 0 595.28 841.');
  // startxref points at the xref table, and every entry points at its object
  const start = Number(text.match(/startxref\n(\d+)/)[1]);
  expect(text.slice(start, start + 4)).toBe('xref');
  const entries = text.slice(start).split('\n').slice(3).filter((l) => / 00000 n $/.test(l));
  entries.forEach((l, i) => expect(text.slice(Number(l.slice(0, 10))).startsWith(i + 1 + ' 0 obj')).toBe(true));
  expect(pdf.length).toBeGreaterThan(20000);
});

test('the PDF format can be picked in the toolbar', async ({ page }) => {
  await open(page);
  await page.locator('select[data-act="format"]').selectOption('pdf');
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+s')]);
  expect(download.suggestedFilename()).toBe('swoop-test.pdf');
  await page.evaluate(() => localStorage.removeItem('swoop-format'));
});

test('in the overlay, right-click cancels before a selection and opens the menu after', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto('/tests/fixtures/editor.html?layout=overlay');
  await page.waitForFunction(() => window.ed);
  await page.mouse.click(300, 300, { button: 'right' });
  await expect(page).toHaveTitle('closed');
  await page.evaluate(() => { document.title = 'open'; });
  await page.mouse.move(200, 200);
  await page.mouse.down();
  await page.mouse.move(500, 400, { steps: 5 });
  await page.mouse.up();
  await page.mouse.click(300, 300, { button: 'right' });
  const menu = page.locator('.se-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem')).toHaveText([/Copy/, /^Save/, /Save as…/, /Undo/, /Redo/, /Cancel/]);
  await menu.getByRole('menuitem', { name: /Cancel/ }).click();
  await expect(page).toHaveTitle('closed');
});
