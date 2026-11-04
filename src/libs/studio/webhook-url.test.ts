import { describe, expect, test } from 'bun:test';
import { studioWebhookUrl } from './webhook-url';

describe('studioWebhookUrl', () => {
  test('a public https base URL gets the webhook route', () => {
    expect(studioWebhookUrl('https://share.example.com')).toBe('https://share.example.com/api/studio/fal-webhook');
    expect(studioWebhookUrl('https://share.example.com/')).toBe('https://share.example.com/api/studio/fal-webhook');
  });

  test('webhooks are off without a base URL, over http, or on a host fal cannot reach', () => {
    for (const base of [
      undefined,
      '',
      'not a url',
      'http://share.example.com',
      'https://localhost:3000',
      'https://app.localhost',
      'https://127.0.0.1',
      'https://10.0.0.5',
      'https://172.20.1.1',
      'https://192.168.1.10',
      'https://169.254.0.1',
      'https://[::1]',
      'https://[fd12::1]',
      'https://nas.local',
      'https://host.docker.internal',
      'https://fal-fake',
    ]) {
      expect({ base, url: studioWebhookUrl(base) }).toEqual({ base, url: null });
    }
  });

  test('IPv4-mapped IPv6, the unspecified address and CGNAT count as private', () => {
    for (const base of [
      'https://[::ffff:10.0.0.1]',
      'https://[::ffff:192.168.1.10]',
      'https://[::ffff:127.0.0.1]',
      'https://[::]',
      'https://100.64.0.1',
      'https://100.127.255.254',
    ]) {
      expect({ base, url: studioWebhookUrl(base) }).toEqual({ base, url: null });
    }
  });

  test('reserved names never resolve publicly, with or without a trailing dot', () => {
    for (const base of [
      'https://share.test',
      'https://share.invalid',
      'https://share.example',
      'https://localhost.',
      'https://nas.local.',
    ]) {
      expect({ base, url: studioWebhookUrl(base) }).toEqual({ base, url: null });
    }
  });

  test('a public address just outside the private ranges is allowed', () => {
    expect(studioWebhookUrl('https://172.32.0.1')).toBe('https://172.32.0.1/api/studio/fal-webhook');
    expect(studioWebhookUrl('https://100.128.0.1')).toBe('https://100.128.0.1/api/studio/fal-webhook');
    expect(studioWebhookUrl('https://[::ffff:8.8.8.8]')).toBe('https://[::ffff:808:808]/api/studio/fal-webhook');
    expect(studioWebhookUrl('https://[2001:db8::1]')).toBe('https://[2001:db8::1]/api/studio/fal-webhook');
  });
});
