import { expect, type Locator } from '@playwright/test';

/**
 * Clicks a control and retries until the click actually took effect.
 *
 * Every page is server-rendered, so between first paint and hydration a button
 * is inert: the markup is there and Playwright will happily click it, but no
 * React handler is attached yet and the click is swallowed. Waiting for
 * "visible" does not help, because visible is exactly the state the problem
 * occurs in.
 *
 * Retrying the click-and-check pair together is the fix, and it is also honest
 * about what is being waited for: not a duration, but the effect itself.
 * Suitable only where a repeated click is harmless — opening a dialog, not
 * submitting a form.
 */
export async function clickUntil(trigger: Locator, expected: Locator): Promise<void> {
  await expect(async () => {
    await trigger.click();
    await expect(expected).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}
