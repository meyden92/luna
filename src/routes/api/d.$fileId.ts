import { GetObjectCommand } from '@aws-sdk/client-s3';
import { createFileRoute } from '@tanstack/react-router';
import { deliverySessionAllowsFile, verifyDeliverySession } from '@/libs/delivery-session';
import { recordEgress } from '@/libs/egress/record';
import { env } from '@/libs/env';
import prisma from '@/libs/prismadb';
import { getOptionalAuthenticatedUser } from '@/libs/rbac/guards';
import { fileS3Key, s3Client } from '@/libs/S3Helper';

async function handle(request: Request, fileId: string): Promise<Response> {
  const file = await prisma.file.findFirst({
    where: { id: fileId, isDeleted: false },
    select: {
      id: true,
      ownerId: true,
      folderId: true,
      url: true,
      title: true,
      private: true,
      size: true,
      contentType: true,
      moderationStatus: true,
    },
  });
  if (!file || file.moderationStatus === 'quarantined') return new Response('Not found', { status: 404 });

  if (file.private) {
    const user = await getOptionalAuthenticatedUser(request.headers);
    const cookie = parseCookie(request.headers.get('cookie')).get('ls_dlv');
    const deliverySession = verifyDeliverySession(cookie);
    const allowedByCookie = deliverySession ? deliverySessionAllowsFile(deliverySession, file) : false;
    if (user?.id !== file.ownerId && !allowedByCookie) return new Response('Forbidden', { status: 403 });
  }

  const range = request.headers.get('range') ?? undefined;
  const object = await s3Client.send(
    new GetObjectCommand({
      Bucket: env.AWS_BUCKET_NAME,
      Key: fileS3Key(file.ownerId, file.url),
      Range: range,
    }),
  );
  const body = Buffer.from(await object.Body!.transformToByteArray());
  await recordEgress({
    ownerId: file.ownerId,
    fileId: file.id,
    bytes: body.byteLength,
    rendition: 'original',
    wasEstimated: false,
  });

  const headers = new Headers({
    'Content-Type': file.contentType,
    'Content-Length': String(body.byteLength),
    'Accept-Ranges': 'bytes',
    'Cache-Control': file.private ? 'private, max-age=60' : 'public, max-age=3600',
  });
  const contentRange = object.ContentRange;
  if (contentRange) headers.set('Content-Range', contentRange);
  return new Response(body, { status: contentRange ? 206 : 200, headers });
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

export const Route = createFileRoute('/api/d/$fileId')({
  server: {
    handlers: {
      GET: ({ request, params }) => handle(request, params.fileId),
    },
  },
});
