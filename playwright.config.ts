import { defineConfig, devices } from '@playwright/test';
import { stackEnv } from './tests/e2e/stack-env';

// Throws unless `bun run test:e2e` started the disposable stack, so the suite
// can never run against the dev server or the dev database.
const { E2E_BASE_URL } = stackEnv();

const browser = {
  ...devices['Desktop Chrome'],
  timezoneId: 'UTC',
  locale: 'en-US',
  // The app signs storage URLs for host.docker.internal; the browser has to
  // reach RustFS under that same name.
  launchOptions: { args: ['--host-resolver-rules=MAP host.docker.internal 127.0.0.1'] },
};

export default defineConfig({
  testDir: './tests/e2e',

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['html', { open: 'never' }]],

  use: {
    baseURL: E2E_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // The fixed users and their sessions, in order: the admin signs in, creates
    // and signs in the other users, then the gallery user is seeded.
    { name: 'setup', testMatch: /auth\.setup\.ts/, use: browser },
    { name: 'setup-users', testMatch: /users\.setup\.ts/, dependencies: ['setup'], use: browser },
    { name: 'setup-gallery', testMatch: /gallery\.setup\.ts/, dependencies: ['setup-users'], use: browser },
    { name: 'chromium', dependencies: ['setup-gallery'], use: browser },
  ],
});
