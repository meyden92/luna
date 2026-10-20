import type { ErrorCategory, ParsedPost } from '../types';
import { instagram } from './instagram';

/** A yt-dlp `ERROR:` line pattern and the error category it means. */
export interface ErrorPattern {
  pattern: RegExp;
  category: Exclude<ErrorCategory, 'no_videos' | 'too_large'>;
}

/** A website LunaShare can make a Download from. */
export interface Source {
  key: string;
  label: string;
  /** Passed to yt-dlp as `--use-extractors`, so only this Source's extractor ever runs. */
  extractor: string;
  /** The canonical post URL and shortcode for a supported link, or null. */
  parseUrl(input: string): { canonicalUrl: string; shortcode: string } | null;
  /** How a failed yt-dlp run maps to an error category, in priority order: the first match wins. */
  errorPatterns: readonly ErrorPattern[];
}

/** Every registered Source, keyed by Source key. */
export const sources: ReadonlyMap<string, Source> = new Map([[instagram.key, instagram]]);

/** The first Source that accepts `input`, with the post it names, or null. */
export function parsePostUrl(input: string): ParsedPost | null {
  for (const source of sources.values()) {
    const parsed = source.parseUrl(input);
    if (parsed) return { sourceKey: source.key, ...parsed };
  }
  return null;
}
