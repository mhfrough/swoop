// The landing page and the privacy page: they load cleanly, the live editor demo works,
// every link goes somewhere, the theme switch sticks and nothing overflows at phone width.
const { test, expect } = require('@playwright/test');

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', (r) => errors.push('failed: ' + r.url()));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ': ' + r.url()); });
  return errors;
}

test('the landing page loads with no errors and the editor demo draws', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Screenshots that stay on your computer.');
  for (const id of ['chrome', 'desktop', 'tools', 'privacy', 'questions', 'download']) {
    await expect(page.locator('#' + id)).toBeAttached();
  }

  const canvas = page.locator('#demo .se-canvas');
  await expect(canvas).toBeVisible();
  const undo = page.locator('#demo [data-act="undo"]');
  await expect(undo).toBeDisabled();

  // draw a box over the sample picture
  await page.locator('#demo button[data-tool="rect"]').click();
  await page.locator('#demo').evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const b = await canvas.boundingBox();
  await page.mouse.move(b.x + b.width * 0.35, b.y + b.height * 0.35);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.6, { steps: 6 });
  await page.mouse.up();
  await expect(undo).toBeEnabled();

  // the editor listens to keys only while it has focus, so typing on the page is left alone
  await page.locator('h1').click();
  await page.keyboard.press('a');
  await expect(page.locator('#demo button[data-tool="rect"]')).toHaveAttribute('aria-pressed', 'true');

  expect(errors).toEqual([]);
});

test('in-page links land on a section and local links load', async ({ page, request }) => {
  await page.goto('/');
  const hrefs = await page.locator('a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  for (const h of hrefs.filter((h) => h.startsWith('#'))) {
    await expect(page.locator(h), h).toBeAttached();
  }
  for (const h of hrefs.filter((h) => !h.startsWith('#') && !/^https?:/.test(h))) {
    expect((await request.get(new URL(h, page.url()).href)).status(), h).toBe(200);
  }
  // downloads go to the fixed names the release workflow attaches
  const downloads = hrefs.filter((h) => h.includes('/releases/latest/download/'));
  expect(downloads.map((h) => h.split('/').pop()).sort()).toEqual(
    ['Swoop-setup.exe', 'Swoop.AppImage', 'swoop-chrome.zip', 'swoop.x86_64.rpm', 'swoop_amd64.deb'].sort());
});

test('the theme switch cycles and is remembered', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const html = page.locator('html');
  const theme = page.locator('#theme');
  await expect(html).not.toHaveAttribute('data-theme', /./);
  await theme.click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await theme.click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(13, 13, 15)');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  // the privacy page follows the same choice
  await page.goto('/privacy.html');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.goto('/');
  await theme.click();
  await expect(html).not.toHaveAttribute('data-theme', /./);
});

test('the desktop button points at the visitor\'s system', async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('#hero-desktop')).toHaveText('Get it for Linux');
  await expect(page.locator('#hero-desktop')).toHaveAttribute('href', '#download-linux');
  await expect(page.locator('#download-linux')).toHaveClass(/is-yours/);
  await ctx.close();
});

for (const path of ['/', '/privacy.html']) {
  test(`${path} fits a phone screen in light and dark`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 760 });
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, scheme).toBeLessThanOrEqual(0);
    }
  });
}

test('the privacy page loads and says nothing is collected', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/privacy.html');
  await expect(page.locator('h1')).toHaveText('Privacy policy');
  await expect(page.locator('.summary')).toContainText('Swoop collects nothing and sends nothing');
  expect(errors).toEqual([]);
});

test('every image and form control on the landing page has a name', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#demo .se-canvas')).toBeVisible();
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll('button, a[href], select, input, [role="img"]')]
      .filter((el) => !el.closest('[aria-hidden="true"]') && !el.closest('.sprite'))
      .filter((el) => !(el.getAttribute('aria-label') || el.textContent.trim() || el.getAttribute('aria-labelledby')))
      .map((el) => el.outerHTML.slice(0, 80)));
  expect(unnamed).toEqual([]);
  const ids = await page.evaluate(() => [...document.querySelectorAll('[id]')].map((e) => e.id));
  expect(new Set(ids).size).toBe(ids.length);
});
