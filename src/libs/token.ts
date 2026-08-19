import { randomBytes } from 'node:crypto';

// 64 characters of lower-case hex. The case matters: `token.key` lookups are
// case-normalised on both sides on Postgres (issue #23), and lower-case hex is
// the canonical form every existing production key already has.
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}
