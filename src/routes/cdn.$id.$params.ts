import { GetObjectCommand } from '@aws-sdk/client-s3';
import { createFileRoute } from '@tanstack/react-router';
import { recordEgress } from '@/libs/egress/record';
import { env } from '@/libs/env';
import prisma from '@/libs/prismadb';
import { canonicalRenditionParams, getOrCreateRendition, parseRenditionParamSegment, verifyRenditionSignature } from '@/libs/renditions';
import { s3Client } from '@/libs/S3Helper';

async function handle(request: Request, id: string, params: string): Promise<Response> {
  const parsed = parseRenditionParamSegment(decodeURIComponent(params), request.headers.get('accept'));
  const canonical = canonicalRenditionParams(parsed);
  const url = new URL(request.url);
  const file = await prisma.file.findFirst({
    where: { id, isDeleted: false, contentType: { startsWith: 'image/' } },
    select: { id: true, ownerId: true, url: true, private: true, size: true, moderationStatus: true },
  });

  if (!file || file.moderationStatus === 'quarantined') return new Response('Not found', { status: 404 });
  if (file.private && !verifyRenditionSignature(file.id, canonical, url.searchParams.get('sig'), url.searchParams.get('exp'))) {
    return new Response('Forbidden', { status: 403 });
  }

  const rendition = await getOrCreateRendition({ file, params: parsed });
  await recordEgress({
    ownerId: file.ownerId,
    fileId: file.id,
    bytes: rendition.size,
    rendition: 'rendition',
    wasEstimated: false,
  });

  const object = await s3Client.send(new GetObjectCommand({ Bucket: env.AWS_BUCKET_NAME, Key: rendition.s3Key }));
  const body = Buffer.from(await object.Body!.transformToByteArray());

  return new Response(body, {
    headers: {
      'Content-Type': rendition.contentType,
      'Content-Length': String(body.byteLength),
      'Cache-Control': 'public, immutable, max-age=31536000',
    },
  });
}

export const Route = createFileRoute('/cdn/$id/$params')({
  server: {
    handlers: {
      GET: ({ request, params }) => handle(request, params.id, params.params),
    },
  },
});
