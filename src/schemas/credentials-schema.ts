import { z } from 'zod';

/**
 * The Username and password rules from issue #54, in one client-safe module so
 * the sign-in form, the profile form, the admin create-User form and
 * Better-Auth's own server config all enforce the same thing.
 *
 * Uniqueness is case-insensitive: Better-Auth's username plugin stores the
 * lower-cased form in `user.username` and the typed form in
 * `user.displayUsername`, so the pattern below only has to reject characters,
 * never casing.
 */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const PASSWORD_MIN_LENGTH = 8;

/**
 * The Avatar upload ceiling, checked in the browser before the file is read and
 * again on the server before it is decoded. It lives here rather than beside
 * the image pipeline because `libs/avatar` pulls in `sharp` and the S3 client,
 * neither of which belongs in a client bundle.
 */
export const AVATAR_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** One wording for the refusal, wherever the ceiling is checked. */
export const avatarTooLargeMessage = () => `Image is larger than ${Math.floor(AVATAR_MAX_UPLOAD_BYTES / 1024 / 1024)} MiB`;

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** Handed to Better-Auth's `usernameValidator`, which only sees the charset. */
export function isValidUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value);
}

export const usernameSchema = z
  .string()
  .min(USERNAME_MIN_LENGTH, `Username must be at least ${USERNAME_MIN_LENGTH} characters`)
  .max(USERNAME_MAX_LENGTH, `Username must be at most ${USERNAME_MAX_LENGTH} characters`)
  .regex(USERNAME_PATTERN, 'Username may only contain letters, numbers, underscores and hyphens');

export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`);

export const displayNameSchema = z.string().trim().min(1, 'Display name is required').max(100);

export const signInSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

export const changeUsernameSchema = z.object({
  username: usernameSchema,
});

export const changeDisplayNameSchema = z.object({
  name: displayNameSchema,
});

export const createUserSchema = z.object({
  username: usernameSchema,
  name: displayNameSchema,
  email: z.email(),
  password: passwordSchema,
});

export const resetUserPasswordSchema = z.object({
  userId: z.string().min(1),
  newPassword: passwordSchema,
});

export type SignInInput = z.infer<typeof signInSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type ResetUserPasswordInput = z.infer<typeof resetUserPasswordSchema>;
