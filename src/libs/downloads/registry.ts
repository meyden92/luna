import { discard, prepare } from './runner';
import type { Download, ParsedPost } from './types';

// Every Download, in memory only: a restart drops them all, by design.
// Every lookup is scoped to the owning User.
const downloads = new Map<string, Download>();

/** Creates a Download for `post` and starts preparing it in the background. */
export function start(userId: string, post: ParsedPost): Download {
  const download: Download = {
    id: crypto.randomUUID(),
    userId,
    sourceKey: post.sourceKey,
    canonicalUrl: post.canonicalUrl,
    shortcode: post.shortcode,
    status: 'preparing',
    videos: [],
    createdAt: new Date(),
  };
  downloads.set(download.id, download);
  void prepare(download);
  return download;
}

/** The User's Downloads, newest first. */
export function listFor(userId: string): Download[] {
  return [...downloads.values()]
    .filter((download) => download.userId === userId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function get(userId: string, id: string): Download | undefined {
  const download = downloads.get(id);
  return download?.userId === userId ? download : undefined;
}

/** Stops the Download's preparation, deletes its files and drops it. False when the User has no such Download. */
export async function remove(userId: string, id: string): Promise<boolean> {
  if (!get(userId, id)) return false;
  downloads.delete(id);
  await discard(id);
  return true;
}
