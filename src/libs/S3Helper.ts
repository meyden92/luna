import { GetObjectCommand, PutObjectAclCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './env';

export const s3Client = new S3Client({
  region: env.AWS_REGION,
  endpoint: env.AWS_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

export function publicUploadAcl(isPrivate: boolean): 'public-read' | 'private' {
  return isPrivate ? 'private' : 'public-read';
}

// File.url is stored URI-encoded, but the S3 object key uses the raw filename.
// Use this for any S3 GetObject/PutObjectAcl/DeleteObjects key built from File.url.
export function fileS3Key(ownerId: string, url: string): string {
  return `${ownerId}/${decodeURIComponent(url)}`;
}

export async function setObjectPrivacy(key: string, isPrivate: boolean): Promise<void> {
  await s3Client.send(
    new PutObjectAclCommand({
      Bucket: env.AWS_BUCKET_NAME,
      Key: key,
      ACL: publicUploadAcl(isPrivate),
    }),
  );
}

export async function getPrivateSignedUrl(key: string, expiresInSeconds = 900): Promise<string> {
  return getSignedUrl(s3Client, new GetObjectCommand({ Bucket: env.AWS_BUCKET_NAME, Key: key }), { expiresIn: expiresInSeconds });
}

function attachmentContentDisposition(filename: string): string {
  const clean = filename.trim().replace(/[\r\n"\\/:*?<>|]+/g, '_') || 'download';
  const fallback = clean.replace(/[^\x20-\x7e]+/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}

export async function getDownloadSignedUrl(key: string, filename: string, expiresInSeconds = 60): Promise<string> {
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: env.AWS_BUCKET_NAME,
      Key: key,
      ResponseContentDisposition: attachmentContentDisposition(filename),
    }),
    { expiresIn: expiresInSeconds },
  );
}
