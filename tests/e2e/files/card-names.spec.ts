import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { cardOf, openOwnFiles, uniquePrefix, uploadOwnFiles } from '../utils/own-files';

// A card with no picture on it names its file, so audio, video and documents can be told apart.

test('cards of audio, video and documents show the file name', async ({ workerPage, workerRequest, corpus }) => {
  const prefix = uniquePrefix('card-name');
  const files = await uploadOwnFiles(workerRequest, prefix, [
    corpus.file('tone.mp3'),
    corpus.file('clip.mp4'),
    corpus.file('document.pdf'),
  ]);

  await openOwnFiles(workerPage, prefix, files.length);

  for (const { title } of files) {
    await expect(cardOf(workerPage, title).getByText(title, { exact: true })).toBeVisible();
  }
});
