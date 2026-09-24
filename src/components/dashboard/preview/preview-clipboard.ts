import { toast } from 'sonner';
import { copyImageToClipboard } from '@/libs/image-clipboard';
import { type PreviewFile, previewShareUrl } from './preview-file';

/**
 * The Preview's clipboard actions: the image write itself is shared with the
 * cards (src/libs/image-clipboard.ts), and what is left here is which URL to
 * read and what to say afterwards.
 */

/** Put the image itself on the clipboard, ready to paste into a chat or a doc. */
export async function copyPreviewImage(file: PreviewFile): Promise<void> {
  try {
    await copyImageToClipboard(file.id);
    toast('Image copied to clipboard');
  } catch {
    toast.error('Could not copy the image');
  }
}

/** Put the share page's address on the clipboard. */
export async function copyPreviewLink(file: PreviewFile): Promise<void> {
  try {
    await navigator.clipboard.writeText(previewShareUrl(file.id));
    toast('Link copied');
  } catch {
    toast.error('Could not copy the link');
  }
}
