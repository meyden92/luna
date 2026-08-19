import { markTemplateGenerationSucceeded } from '@/db/queries/ai';
import { markTemplateGenerationFailed } from '@/db/queries/tasks';
import { firstReplicateOutput, throwIfAborted, uploadGeneratedImageToS3 } from '@/libs/ai-generation-utils';

/**
 * Turns a succeeded Replicate prediction into a stored file and records it on
 * the generation. Both status writes are audited inside the query module, since
 * `TemplateGeneration` is an audited model.
 */
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
    await markTemplateGenerationFailed(generationId, { errorMessage: 'No output generated', replicateStatus }, userId);
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
  await markTemplateGenerationSucceeded(generationId, { resultFileId: fileId, replicateStatus }, userId);

  return result_url;
}
