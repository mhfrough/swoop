// Playwright: the editor, the extension's full-page capture and the landing page.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests',
  timeout: 90000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:8176' },
  webServer: {
    command: 'python -m http.server 8176',
    url: 'http://localhost:8176/icon.svg',
    reuseExistingServer: true,
    timeout: 20000,
  },
});
