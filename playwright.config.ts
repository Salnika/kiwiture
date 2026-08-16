import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
const BASE_PATH = '/kiwiture/'

/**
 * Allows running against a Chromium that is already on the machine
 * (`PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome npm run test:e2e`) instead of the
 * exact build Playwright would download. CI just runs `playwright install`.
 */
const launchOptions = {
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {}),
  // Lets the live smoke test run behind a corporate/sandbox HTTP proxy.
  ...(process.env.PLAYWRIGHT_PROXY
    ? { proxy: { server: process.env.PLAYWRIGHT_PROXY, bypass: '127.0.0.1,localhost' } }
    : {}),
}

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: `http://127.0.0.1:${PORT}${BASE_PATH}`,
    trace: 'on-first-retry',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
  },

  projects: [
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'], launchOptions },
    },
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
        launchOptions,
      },
    },
  ],

  webServer: {
    // `--host 127.0.0.1` is required: without it Vite binds `localhost`, which on
    // some CI runners resolves to ::1 only, and Playwright's IPv4 health check
    // never succeeds.
    command: `npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}${BASE_PATH}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
