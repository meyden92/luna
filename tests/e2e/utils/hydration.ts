import { expect, type Locator } from '@playwright/test';

/**
 * Clicks a control and retries until the click takes effect. Before hydration a
 * button is visible but inert, so waiting for "visible" does not help.
 *
 * Only for controls where a repeated click is harmless: opening a dialog, not
 * submitting a form.
 */
export async function clickUntil(trigger: Locator, expected: Locator): Promise<void> {
  await expect(async () => {
    await trigger.click();
    await expect(expected).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

/**
 * Waits until React has hydrated the element (it then carries its props). Typing into a controlled
 * input before that is lost, so call this on a field of a freshly loaded form before filling it.
 */
export async function untilHydrated(element: Locator): Promise<void> {
  await expect
    .poll(() => element.evaluate((node) => Object.keys(node).some((key) => key.startsWith('__reactProps'))), { timeout: 15_000 })
    .toBe(true);
}
