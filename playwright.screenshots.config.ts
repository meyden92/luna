import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Config of `bun run screenshots`: the main config's admin and user setup, then the
// capture. Kept out of `playwright.config.ts` so `bun run test:e2e` never captures.
const [setup, setupUsers, , chromium] = base.projects ?? [];
if (!setup || !setupUsers || !chromium) throw new Error('playwright.config.ts projects changed: update playwright.screenshots.config.ts');

export default defineConfig({
  ...base,
  reporter: 'list',
  projects: [setup, setupUsers, { name: 'screenshots', testDir: './tests/screenshots', dependencies: ['setup-users'], use: chromium.use }],
});
