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

  test('a public address just outside the private ranges is allowed', () => {
    expect(studioWebhookUrl('https://172.32.0.1')).toBe('https://172.32.0.1/api/studio/fal-webhook');
  });
});
