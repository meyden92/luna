import { describe, expect, test } from 'bun:test';
import { clientIp } from './client-ip';

const forwarded = (value: string) => new Headers({ 'x-forwarded-for': value });

describe('clientIp', () => {
  test('ignores client-settable headers when no proxy is trusted', () => {
    const headers = new Headers({ 'x-forwarded-for': '6.6.6.6', 'cf-connecting-ip': '6.6.6.6' });
    expect(clientIp(headers, 0, '198.51.100.1')).toBe('198.51.100.1');
  });

  test('takes the address the outermost trusted proxy saw', () => {
    // A client-supplied entry sits to the left of what the proxies appended.
    expect(clientIp(forwarded('6.6.6.6, 203.0.113.5'), 1, '10.0.0.2')).toBe('203.0.113.5');
    expect(clientIp(forwarded('6.6.6.6, 203.0.113.5, 10.0.0.3'), 2, '10.0.0.2')).toBe('203.0.113.5');
  });

  test('falls back to the socket peer when the proxy sent no forwarded header', () => {
    expect(clientIp(new Headers(), 1, '10.0.0.2')).toBe('10.0.0.2');
  });
});
