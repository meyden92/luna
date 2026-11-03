import { describe, expect, test } from 'bun:test';
import { clientIp, isPrivateIp, proxyDiagnosis } from './client-ip';

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

describe('proxyDiagnosis', () => {
  test('a correct setup behind one proxy raises nothing', () => {
    const d = proxyDiagnosis(forwarded('203.0.113.5'), 1, '172.18.0.2');
    expect(d.derivedIp).toBe('203.0.113.5');
    expect(d.chain).toEqual([{ ip: '203.0.113.5', hop: 1 }]);
    expect(d.warnings).toEqual([]);
  });

  test('warns when a proxy is in front but no hop is trusted', () => {
    const d = proxyDiagnosis(forwarded('203.0.113.5'), 0, '172.18.0.2');
    expect(d.derivedIp).toBe('172.18.0.2');
    expect(d.warnings).toEqual(['proxy-untrusted']);
  });

  test('a direct connection without forwarded headers raises nothing', () => {
    expect(proxyDiagnosis(new Headers(), 0, '203.0.113.5').warnings).toEqual([]);
  });

  test('warns when more hops are trusted than the chain has', () => {
    expect(proxyDiagnosis(forwarded('203.0.113.5'), 3, '172.18.0.2').warnings).toEqual(['hops-exceed-chain']);
  });

  test('warns when the derived address is a private one', () => {
    expect(proxyDiagnosis(forwarded('203.0.113.5, 10.0.0.3'), 1, '10.0.0.2').warnings).toEqual(['derived-private']);
  });

  test("suggests the hop count at which Cloudflare's address sits", () => {
    const headers = new Headers({ 'x-forwarded-for': '6.6.6.6, 203.0.113.5, 172.70.1.2', 'cf-connecting-ip': '203.0.113.5' });
    const d = proxyDiagnosis(headers, 1, '10.0.0.2');
    expect(d.suggestedHops).toBe(2);
    expect(d.warnings).toContain('hops-differ-from-cloudflare');
  });
});

describe('isPrivateIp', () => {
  test('recognises private, loopback and mapped addresses', () => {
    for (const ip of [
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.1',
      '192.168.1.1',
      '127.0.0.1',
      '::1',
      'fd00::1',
      'fe80::1',
      '::ffff:10.0.0.1',
    ]) {
      expect(isPrivateIp(ip)).toBe(true);
    }
    for (const ip of ['203.0.113.5', '172.32.0.1', '8.8.8.8', '2001:db8::1']) expect(isPrivateIp(ip)).toBe(false);
  });
});
