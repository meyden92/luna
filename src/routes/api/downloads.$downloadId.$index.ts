import { createFileRoute } from '@tanstack/react-router';
import { get } from '@/libs/downloads/registry';
import { videoPath } from '@/libs/downloads/runner';
import { ForbiddenError, requireAdmin } from '@/libs/rbac/guards';

// The byte range a single-range `Range: bytes=…` header asks for, clamped to the
// file, or 'unsatisfiable'. Null when there is no header or it isn't one we serve,
// in which case the whole file goes out.
function parseRange(header: string | null, size: number): { start: number; end: number } | 'unsatisfiable' | null {
  const match = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const [, from = '', to = ''] = match;
  if (!from && !to) return null;

  let start: number;
  let end: number;
  if (!from) {
    // A suffix range: the last `to` bytes.
    start = Math.max(size - Number(to), 0);
    end = size - 1;
  } else {
    start = Number(from);
    end = to ? Math.min(Number(to), size - 1) : size - 1;
  }
  if (start > end || start >= size) return 'unsatisfiable';
  return { start, end };
}

/**
 * Serves a ready video of one of the caller's Downloads. As an attachment named
 * after the video by default; `?inline=1` drops the disposition so the same URL
 * feeds the preview `<video>`, which needs Range support to play in Safari.
 */
async function handle(request: Request, downloadId: string, index: string): Promise<Response> {
  let userId: string;
  try {
    userId = (await requireAdmin(request.headers)).id;
  } catch (error) {
    return new Response(error instanceof ForbiddenError ? 'Forbidden' : 'Unauthorized', {
      status: error instanceof ForbiddenError ? 403 : 401,
    });
  }

  const download = get(userId, downloadId);
  const video = download?.videos.find((candidate) => String(candidate.index) === index);
  if (!download || !video || video.status !== 'ready') return new Response('Not found', { status: 404 });

  const file = Bun.file(videoPath(download.id, video.index));
  const size = file.size;
  const headers = new Headers({
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  });
  if (new URL(request.url).searchParams.get('inline') !== '1') {
    headers.set('Content-Disposition', `attachment; filename="${video.filename}"`);
  }

  const range = parseRange(request.headers.get('range'), size);
  if (range === 'unsatisfiable') {
    headers.set('Content-Range', `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  if (range) {
    headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
    headers.set('Content-Length', String(range.end - range.start + 1));
    return new Response(file.slice(range.start, range.end + 1), { status: 206, headers });
  }

  headers.set('Content-Length', String(size));
  return new Response(file, { headers });
}

export const Route = createFileRoute('/api/downloads/$downloadId/$index')({
  server: { handlers: { GET: ({ request, params }) => handle(request, params.downloadId, params.index) } },
});
