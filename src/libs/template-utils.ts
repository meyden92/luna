import { firstReplicateOutput, throwIfAborted, uploadGeneratedImageToS3 } from '@/libs/ai-generation-utils';
import prisma from '@/libs/prismadb';

export async function processSuccessfulGeneration(
  generationId: string,
  resultImageUrl: unknown,
  userId: string,
  templateId: string,
  templateName: string,
  replicateStatus: string,
  customTitle?: string | null,
  signal?: AbortSignal,
) {
  const outputUrl = firstReplicateOutput(resultImageUrl);
  if (!outputUrl) {
    throwIfAborted(signal);
    await prisma.templateGeneration.update({
      where: { id: generationId },
      data: {
        status: 'failed',
        errorMessage: 'No output generated',
        replicateStatus,
      },
    });
    throw new Error('No output generated');
  }

  const timestamp = Date.now();
  const resultFilename = `template_${templateId}_result_${timestamp}.png`;
  const title = customTitle || `${templateName} Result`;

  const { url: result_url, fileId } = await uploadGeneratedImageToS3({
    imageUrl: outputUrl,
    fileName: resultFilename,
    userId,
    tags: 'template-editing, nano-banana, ai',
    title,
    signal,
    logPrefix: '[template-utils]',
  });

  throwIfAborted(signal);
  await prisma.templateGeneration.update({
    where: { id: generationId },
    data: {
      status: 'success',
      resultFileId: fileId,
      replicateStatus: replicateStatus,
    },
  });

  return result_url;
}
