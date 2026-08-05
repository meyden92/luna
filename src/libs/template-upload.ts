import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomBytes } from 'crypto';

import { env } from './env';
import { s3Client } from './S3Helper';
import { getTemplateImageUrl } from './utils';

export { getTemplateImageUrl };

const BUCKET_NAME = env.AWS_BUCKET_NAME;

export async function uploadTemplateImages(files: File[], templateName: string): Promise<string[]> {
  const uploadPromises = files.map(async (file, index) => {
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileExtension = file.name.split('.').pop();
    const sanitizedTemplateName = templateName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const randomId = randomBytes(8).toString('hex');
    const key = `static/template/${sanitizedTemplateName}/previews/${randomId}-${index}.${fileExtension}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: file.type,
      CacheControl: 'public, max-age=31536000', // 1 year cache
    });

    await s3Client.send(command);

    // Return just the relative path (key) instead of full URL
    return key;
  });

  return Promise.all(uploadPromises);
}

export async function deleteTemplateImages(imagePaths: string[]): Promise<void> {
  const deletePromises = imagePaths.map(async (path) => {
    try {
      const key = path.startsWith('http') ? new URL(path).pathname.replace(/^\//, '') : path.replace(/^\//, '');
      const command = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      });

      await s3Client.send(command);
      console.log(`Successfully deleted S3 object: ${key}`);
    } catch (error) {
      console.error(`Failed to delete template image ${path}:`, error);
      // Don't throw - continue deleting other images
    }
  });

  await Promise.all(deletePromises);
}
