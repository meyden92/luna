import { describe, expect, test } from 'bun:test';
import { auditSessionId } from './metadata-collector';

const withCookie = (cookie: string) => new Headers({ cookie });

describe('auditSessionId', () => {
  test('hashes the session cookie, under either name Better-Auth gives it', () => {
    const plain = auditSessionId(withCookie('theme=dark; lunashare.session_token=abc.sig'));
    expect(plain).toMatch(/^[0-9a-f]{32}$/);
    expect(auditSessionId(withCookie('__Secure-lunashare.session_token=abc.sig'))).toBe(plain);
  });

  test('gives nothing without a session cookie', () => {
    expect(auditSessionId(new Headers())).toBeUndefined();
    expect(auditSessionId(withCookie('better-auth.session_token=abc.sig'))).toBeUndefined();
  });
});
