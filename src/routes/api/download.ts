import { createFileRoute } from '@tanstack/react-router';
import { deliverySessionAllowsFile, verifyDeliverySession } from '@/libs/delivery-session';
import { recordEgress } from '@/libs/egress/record';
import prisma from '@/libs/prismadb';
import { getOptionalAuthenticatedUser } from '@/libs/rbac/guards';
import { isUserAdmin } from '@/libs/rbac/service';
import { fileS3Key, getDownloadSignedUrl } from '@/libs/S3Helper';

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function downloadFilename(title: string | null, url: string): string {
  return title?.trim() || safeDecode(url)?.split('/').pop() || 'lunashare-download';
}

async function handle(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const id = requestUrl.searchParams.get('id');
  if (!id) return json({ error: 'File id required' }, 400);

  const file = await prisma.file.findFirst({
    where: { id, isDeleted: false },
    select: { id: true, folderId: true, title: true, url: true, ownerId: true, private: true, size: true, moderationStatus: true },
  });
  if (!file || file.moderationStatus === 'quarantined') return json({ error: 'File not found' }, 404);

  if (file.private) {
    const viewerId = (await getOptionalAuthenticatedUser(request.headers))?.id;
    const cookie = parseCookie(request.headers.get('cookie')).get('ls_dlv');
    const deliverySession = verifyDeliverySession(cookie);
    const allowedByCookie = deliverySession ? deliverySessionAllowsFile(deliverySession, file) : false;
    const allowedByUser = viewerId ? viewerId === file.ownerId || (await isUserAdmin(viewerId)) : false;
    if (!allowedByCookie && !allowedByUser) return json({ error: viewerId ? 'Forbidden' : 'Unauthorized' }, viewerId ? 403 : 401);
  }

  await recordEgress({
    ownerId: file.ownerId,
    fileId: file.id,
    bytes: file.size,
    rendition: 'download',
    wasEstimated: true,
  });
  const signedUrl = await getDownloadSignedUrl(fileS3Key(file.ownerId, file.url), downloadFilename(file.title, file.url));
  return Response.redirect(signedUrl, 302);
}

function parseCookie(header: string | null): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of header?.split(';') ?? []) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (!rawKey) continue;
    map.set(rawKey, decodeURIComponent(rest.join('=')));
  }
  return map;
}

export const Route = createFileRoute('/api/download')({
  server: { handlers: { GET: ({ request }) => handle(request) } },
});
