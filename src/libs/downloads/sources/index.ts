import type { ParsedPost } from '../types';
import { instagram } from './instagram';

/** A website LunaShare can make a Download from. */
export interface Source {
  key: string;
  label: string;
  /** Passed to yt-dlp as `--use-extractors`, so only this Source's extractor ever runs. */
  extractor: string;
  /** The canonical post URL and shortcode for a supported link, or null. */
  parseUrl(input: string): { canonicalUrl: string; shortcode: string } | null;
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
