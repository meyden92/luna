import { defineConfig, devices } from '@playwright/test';
import { stackEnv } from './tests/e2e/stack-env';

// Throws unless `bun run test:e2e` started the disposable stack, so the suite
// can never run against the dev server or the dev database.
const { E2E_BASE_URL } = stackEnv();

// The Studio Budget spec sets a small default Budget, which would refuse other specs' Generations.
const INSTANCE_WIDE_SPECS = /admin\/studio\/budget\.spec\.ts/;

const browser = {
  ...devices['Desktop Chrome'],
  timezoneId: 'UTC',
  locale: 'en-US',
  // The app signs storage URLs for host.docker.internal; the browser has to
  // reach RustFS under that same name. fal-fake hands out URLs (thumbnails,
  // uploaded inputs) under its service name.
  launchOptions: { args: ['--host-resolver-rules=MAP host.docker.internal 127.0.0.1,MAP fal-fake 127.0.0.1'] },
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
    { name: 'chromium', dependencies: ['setup-gallery'], testIgnore: INSTANCE_WIDE_SPECS, use: browser },
    // Specs that change instance-wide settings every other spec runs under, once the rest is done.
    { name: 'instance-wide', dependencies: ['chromium'], testMatch: INSTANCE_WIDE_SPECS, use: browser },
  ],
});
