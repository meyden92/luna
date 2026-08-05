import { type BrowserContext, test as base, type Page } from '@playwright/test';

type AuthFixtures = {
  authenticatedContext: BrowserContext;
  authenticatedPage: Page;
  adminContext: BrowserContext;
  adminPage: Page;
};

function requireStoragePath(envVar: 'E2E_USER_STORAGE' | 'E2E_ADMIN_STORAGE'): string {
  const path = process.env[envVar];
  if (!path) {
    throw new Error(`${envVar} not set — globalSetup must run before auth fixtures are used.`);
  }
  return path;
}

export const test = base.extend<AuthFixtures>({
  authenticatedContext: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: requireStoragePath('E2E_USER_STORAGE') });
    await use(ctx);
    await ctx.close();
  },
  authenticatedPage: async ({ authenticatedContext }, use) => {
    const page = await authenticatedContext.newPage();
    await use(page);
    await page.close();
  },
  adminContext: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: requireStoragePath('E2E_ADMIN_STORAGE') });
    await use(ctx);
    await ctx.close();
  },
  adminPage: async ({ adminContext }, use) => {
    const page = await adminContext.newPage();
    await use(page);
    await page.close();
  },
});
