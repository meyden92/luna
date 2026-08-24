import { expect, test } from '@playwright/test';

/**
 * The login page offers no sign-up link, but a missing link is not the control:
 * Better-Auth mounts its sign-up endpoint either way. Knock on it directly.
 */
test.describe('Public registration', () => {
  test('the sign-up endpoint refuses to create an account', async ({ request }) => {
    const res = await request.post('/api/auth/sign-up/email', {
      data: {
        email: 'uninvited@lunashare.test',
        password: 'a-perfectly-valid-password',
        name: 'Uninvited',
        username: 'uninvited',
      },
    });

    expect(res.ok()).toBe(false);
  });
});
