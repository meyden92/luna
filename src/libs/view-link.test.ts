import { describe, expect, test } from 'bun:test';
import { buildViewUrl, isDiscordCrawler, parseViewId, viewExtension } from './view-link';

const DISCORDBOT_UA = 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)';

describe('viewExtension', () => {
  test('maps the image types Discord inlines to their extension', () => {
    expect(viewExtension('image/jpeg')).toBe('.jpg');
    expect(viewExtension('image/png')).toBe('.png');
    expect(viewExtension('image/gif')).toBe('.gif');
    expect(viewExtension('image/webp')).toBe('.webp');
  });

  test('gives nothing for other types', () => {
    expect(viewExtension('image/svg+xml')).toBe('');
    expect(viewExtension('video/mp4')).toBe('');
  });
});

describe('buildViewUrl', () => {
  test('appends the extension for an inlinable image', () => {
    expect(buildViewUrl('https://lunashare.app', { id: 'abc', contentType: 'image/png' })).toBe('https://lunashare.app/view/abc.png');
  });

  test('leaves other files extensionless', () => {
    expect(buildViewUrl('https://lunashare.app', { id: 'abc', contentType: 'video/mp4' })).toBe('https://lunashare.app/view/abc');
  });
});

describe('parseViewId', () => {
  test('strips a known extension', () => {
    expect(parseViewId('abc.jpg')).toBe('abc');
    expect(parseViewId('abc.WEBP')).toBe('abc');
  });

  test('keeps an extensionless id as is', () => {
    expect(parseViewId('abc')).toBe('abc');
  });

  test('keeps an unknown suffix as part of the id', () => {
    expect(parseViewId('abc.mp4')).toBe('abc.mp4');
  });
});

describe('isDiscordCrawler', () => {
  test("matches Discord's metadata crawler", () => {
    expect(isDiscordCrawler(DISCORDBOT_UA)).toBe(true);
  });

  test('ignores browsers and missing user agents', () => {
    expect(isDiscordCrawler('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36')).toBe(false);
    expect(isDiscordCrawler(null)).toBe(false);
  });
});
