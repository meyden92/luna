import { startViewTransition } from '@/libs/view-transition';

/**
 * The shared `view-transition-name` that morphs a thumbnail into the Preview
 * image and back. Only one element in the document may carry it at a time,
 * which is why it is applied for the length of a transition and then removed.
 * `::view-transition-group(preview-media)` in motion.css animates it.
 */
const PREVIEW_MEDIA = 'preview-media';

/** The media element inside a file card, tagged so the morph can find it. */
export const PREVIEW_MEDIA_ATTR = 'data-preview-media';

function mediaFor(fileId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[${PREVIEW_MEDIA_ATTR}="${CSS.escape(fileId)}"]`);
}

/**
 * Open the Preview so the card's thumbnail grows into the full image.
 *
 * The name goes on the card's media *before* the snapshot is taken and comes
 * off immediately after, so the Preview's own `<img>` — which carries the same
 * name — becomes the element's new state and the browser tweens between them.
 */
export function morphIntoPreview(fileId: string, open: () => void): void {
  const media = mediaFor(fileId);
  if (!media) {
    open();
    return;
  }

  media.style.viewTransitionName = PREVIEW_MEDIA;
  startViewTransition(() => {
    media.style.viewTransitionName = '';
    open();
  }, 'preview');
}

/**
 * Close the Preview so the full image shrinks back into its card.
 *
 * The destination card does not exist until the Preview has gone, so the name
 * is applied inside the transition callback — after the state update — and
 * taken back only once the animation has finished, since no two elements may
 * claim it at the same time.
 */
export function morphOutOfPreview(fileId: string, close: () => void): void {
  let media: HTMLElement | null = null;

  startViewTransition(() => {
    close();
    media = mediaFor(fileId);
    if (media) media.style.viewTransitionName = PREVIEW_MEDIA;
  }, 'preview').then(() => {
    if (media) media.style.viewTransitionName = '';
  });
}
