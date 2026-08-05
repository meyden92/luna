import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';

test.describe('User profile page', () => {
  test('user can view their own profile by id', async ({ authenticatedPage, authenticatedContext }) => {
    const session = await authenticatedContext.request.get('/api/auth/get-session').then((r) => r.json());
    const userId = session?.user?.id as string;
    expect(userId).toBeTruthy();

    await authenticatedPage.goto(`/profile/${userId}`);
    await expect(authenticatedPage.getByRole('heading', { name: session.user.name, level: 1 })).toBeVisible();
  });

  test('unknown profile id renders 404 not-found content', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/profile/this-is-not-a-real-user-id', { waitUntil: 'domcontentloaded' });
    await expect(authenticatedPage.getByRole('heading', { name: /404/i, level: 1 })).toBeVisible();
  });
});
