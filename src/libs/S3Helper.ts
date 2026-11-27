import { GetObjectCommand, PutObjectAclCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { UserFacingError } from './user-facing-error';
import { getConfig, vaultVersion } from './vault/vault';

export class StorageNotConfiguredError extends UserFacingError {
  override status = 503;

  constructor() {
    super('Storage is not configured yet. An admin sets it up under Settings → Vault.', 'StorageNotConfiguredError');
  }
}

let cached: { version: number; client: S3Client; bucket: string } | undefined;

/** The S3 client and bucket for the current Vault values; fetch it per operation, never keep it. */
export function getS3(): { client: S3Client; bucket: string } {
  const version = vaultVersion();
  if (cached?.version === version) return cached;
  const region = getConfig('AWS_REGION');
  const endpoint = getConfig('AWS_ENDPOINT');
  const accessKeyId = getConfig('AWS_ACCESS_KEY_ID');
  const secretAccessKey = getConfig('AWS_SECRET_ACCESS_KEY');
  const bucket = getConfig('AWS_BUCKET_NAME');
  if (!region || !endpoint || !accessKeyId || !secretAccessKey || !bucket) throw new StorageNotConfiguredError();
  const client = new S3Client({ region, endpoint, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
  cached = { version, client, bucket };
  return cached;
}

export function publicUploadAcl(isPrivate: boolean): 'public-read' | 'private' {
  return isPrivate ? 'private' : 'public-read';
}

// File.url is stored URI-encoded, but the S3 object key uses the raw filename.
// Use this for any S3 GetObject/PutObjectAcl/DeleteObjects key built from File.url.
export function fileS3Key(ownerId: string, url: string): string {
  return `${ownerId}/${decodeURIComponent(url)}`;
}

export async function setObjectPrivacy(key: string, isPrivate: boolean): Promise<void> {
  const { client, bucket } = getS3();
  await client.send(
    new PutObjectAclCommand({
      Bucket: bucket,
      Key: key,
      ACL: publicUploadAcl(isPrivate),
    }),
  );
}

export async function getPrivateSignedUrl(key: string, expiresInSeconds = 900): Promise<string> {
  const { client, bucket } = getS3();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: expiresInSeconds });
}

function attachmentContentDisposition(filename: string): string {
  const clean = filename.trim().replace(/[\r\n"\\/:*?<>|]+/g, '_') || 'download';
  const fallback = clean.replace(/[^\x20-\x7e]+/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}

export async function getDownloadSignedUrl(key: string, filename: string, expiresInSeconds = 60): Promise<string> {
  const { client, bucket } = getS3();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: attachmentContentDisposition(filename),
    }),
    { expiresIn: expiresInSeconds },
  );
}
