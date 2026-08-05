import type { BrowserContext } from '@playwright/test';

export type SupportedLocale = 'en' | 'de';

export async function setLocale(context: BrowserContext, locale: SupportedLocale, host = 'localhost'): Promise<void> {
  await context.addCookies([
    {
      name: 'NEXT_LOCALE',
      value: locale,
      domain: host,
      path: '/',
      expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
}
