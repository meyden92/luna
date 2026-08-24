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
