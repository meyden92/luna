import { DeleteObjectsCommand } from '@aws-sdk/client-s3';
import prisma from '@/libs/prismadb';
import { s3Client } from '@/libs/S3Helper';
import { env } from '../../env';

export async function deleteExpiredCacheExecutor(): Promise<{
  summary: string;
  details: {
    totalFound: number;
    deletedCount: number;
    s3BatchesProcessed: number;
    filesProcessed: string[];
    errors: string[];
  };
}> {
  const errors: string[] = [];
  const filesProcessed: string[] = [];
  let s3BatchesProcessed = 0;

  try {
    console.log('🧹 Starting cache cleanup task...');

    // Find expired cache entries (not accessed in the last 30 minutes)
    const expiredCacheImages = await prisma.cachedImage.findMany({
      where: {
        lastAccessedAt: {
          lt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
        },
      },
      take: 100, // Process in batches to avoid memory issues
      select: {
        id: true,
        url: true,
        lastAccessedAt: true,
        createdAt: true,
      },
    });

    console.log(`📊 Found ${expiredCacheImages.length} expired cache entries`);

    if (expiredCacheImages.length === 0) {
      const summary = 'No expired cache entries found - cache is clean!';
      console.log(`✅ ${summary}`);
      return {
        summary,
        details: {
          totalFound: 0,
          deletedCount: 0,
          s3BatchesProcessed: 0,
          filesProcessed: [],
          errors: [],
        },
      };
    }

    // Log details about files to be deleted
    console.log('📋 Cache entries to be deleted:');
    expiredCacheImages.forEach((image, index) => {
      const ageMinutes = Math.round((Date.now() - image.lastAccessedAt.getTime()) / (1000 * 60));
      const fileName = image.url.split('/').pop() || 'unknown';
      console.log(`  ${index + 1}. ${fileName} (age: ${ageMinutes}m, size: ~unknown)`);
      filesProcessed.push(`${fileName} (${ageMinutes}m old)`);
    });

    const expiredIds = expiredCacheImages.map((image) => image.id);
    const expiredUrls = [...new Set(expiredCacheImages.map((image) => image.url))];
    const retainedRows = await prisma.cachedImage.findMany({
      where: {
        url: { in: expiredUrls },
        id: { notIn: expiredIds },
      },
      select: { url: true },
    });
    const retainedUrls = new Set(retainedRows.map((image) => image.url));

    // Prepare S3 delete operations. A cache object can be referenced by
    // multiple owner-scoped DB rows, so only delete objects with no retained row.
    const s3Objects = expiredUrls.flatMap((urlValue) => {
      if (retainedUrls.has(urlValue)) return [];

      // Extract S3 key from URL
      const url = new URL(urlValue);
      const key = url.pathname.substring(1); // Remove leading slash
      return [{ Key: key }];
    });

    console.log(`☁️ Preparing to delete ${s3Objects.length} objects from S3...`);

    // Delete from S3 in batches (S3 allows max 1000 objects per delete operation)
    const batchSize = 1000;
    for (let i = 0; i < s3Objects.length; i += batchSize) {
      const batch = s3Objects.slice(i, i + batchSize);

      if (batch.length > 0) {
        try {
          console.log(`🗑️ Processing S3 batch ${s3BatchesProcessed + 1} (${batch.length} objects)...`);

          const deleteResult = await s3Client.send(
            new DeleteObjectsCommand({
              Bucket: env.AWS_BUCKET_NAME,
              Delete: {
                Objects: batch,
                Quiet: false, // Get detailed results
              },
            }),
          );

          s3BatchesProcessed++;

          if (deleteResult.Deleted && deleteResult.Deleted.length > 0) {
            console.log(`✅ Successfully deleted ${deleteResult.Deleted.length} objects from S3`);
          }

          if (deleteResult.Errors && deleteResult.Errors.length > 0) {
            deleteResult.Errors.forEach((error) => {
              const errorMsg = `S3 delete error for ${error.Key}: ${error.Code} - ${error.Message}`;
              errors.push(errorMsg);
              console.error(`❌ ${errorMsg}`);
            });
          }
        } catch (s3Error) {
          const errorMsg = `Error deleting batch ${s3BatchesProcessed + 1} (${batch.length} objects) from S3: ${s3Error instanceof Error ? s3Error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          console.error(`❌ ${errorMsg}`);
          // Continue with database cleanup even if S3 fails
        }
      }
    }

    console.log('🗄️ Cleaning up database entries...');

    // Delete from database
    const deletedResult = await prisma.cachedImage.deleteMany({
      where: {
        id: {
          in: expiredIds,
        },
      },
    });

    const deletedCount = deletedResult.count;
    console.log(`✅ Deleted ${deletedCount} entries from database`);

    // Generate summary
    const hasErrors = errors.length > 0;
    const summary = hasErrors
      ? `Cache cleanup completed with ${errors.length} errors: deleted ${deletedCount}/${expiredCacheImages.length} cache entries`
      : `Cache cleanup successful: deleted ${deletedCount} expired cache entries, processed ${s3BatchesProcessed} S3 batches`;

    console.log(`🎉 ${summary}`);

    return {
      summary,
      details: {
        totalFound: expiredCacheImages.length,
        deletedCount,
        s3BatchesProcessed,
        filesProcessed,
        errors: errors.length > 0 ? errors : [],
      },
    };
  } catch (error) {
    const errorMsg = `Cache cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    console.error(`💥 ${errorMsg}`);
    throw new Error(errorMsg);
  }
}
