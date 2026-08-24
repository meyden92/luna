import { expect, test } from '@playwright/test';

/**
 * Registration is closed (issue #54): Users are created by an administrator or
 * by `scripts/auth/set-credentials.ts`, never by whoever finds the instance.
 *
 * The login page offers no sign-up link, but the absence of a link is not the
 * control — Better-Auth mounts its sign-up endpoint whether or not anything
 * points at it, so what actually closes the door is `disableSignUp`. That is
 * what this asserts, by knocking on the door directly.
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
