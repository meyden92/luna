import { type Browser, expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { storageStatePath } from '../fixtures/users';

// The admin start page's Client IP card (#236). The stack trusts one proxy hop, so the address the test sends in
// `x-forwarded-for` is the one the app derives.

async function clientIpCard(browser: Browser, headers: Record<string, string>) {
  const context = await browser.newContext({ storageState: storageStatePath('admin'), extraHTTPHeaders: headers });
  const page = await context.newPage();
  await page.goto('/admin');
  const card = page.locator('[data-slot="card"]').filter({ has: page.getByText('Client IP', { exact: true }) });
  return { card, close: () => context.close() };
}

test('a correctly trusted proxy shows the forwarded address and no warning', async ({ browser }) => {
  const { card, close } = await clientIpCard(browser, { 'x-forwarded-for': '203.0.113.20' });
  await expect(card.getByText('203.0.113.20 (hop 1)')).toBeVisible();
  await expect(card.getByRole('alert')).toHaveCount(0);
  await close();
});

test('too few trusted hops are flagged, with the hop Cloudflare points at', async ({ browser }) => {
  const { card, close } = await clientIpCard(browser, {
    'x-forwarded-for': '198.51.100.7, 192.168.77.5',
    'cf-connecting-ip': '198.51.100.7',
  });
  await expect(card.getByText('192.168.77.5', { exact: true })).toBeVisible();
  await expect(card.getByRole('alert').filter({ hasText: 'probably too low' })).toBeVisible();
  await expect(card.getByRole('alert').filter({ hasText: 'Set TRUSTED_PROXY_HOPS=2.' })).toBeVisible();
  await close();
});
