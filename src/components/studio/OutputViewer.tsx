import { ClientOnly } from '@tanstack/react-router';
import { lazy, Suspense, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import type { OutputView } from '@/libs/studio/views';
import styles from './OutputViewer.module.css';

const ModelViewer = lazy(() => import('./ModelViewer'));

/** An Output inline in the history: an image opening full size, a video or audio player, or a rotatable 3D model. */
export function OutputViewer({ output }: { output: OutputView }) {
  const [open, setOpen] = useState(false);
  const label = `Output ${output.index + 1}`;

  if (!output.url) return <p className={styles.expired}>Output expired</p>;

  switch (output.mediaKind) {
    case 'image':
      return (
        <>
          <button
            type="button"
            className={styles.thumbnail}
            aria-label={`Open ${label} full size`}
            onClick={() => setOpen(true)}
          >
            <img
              src={output.url}
              alt={label}
              width={output.width ?? undefined}
              height={output.height ?? undefined}
              loading="lazy"
            />
          </button>
          <Dialog
            open={open}
            onOpenChange={setOpen}
          >
            <DialogContent
              size="full"
              className={styles.lightbox}
            >
              <DialogHeader className="sr-only">
                <DialogTitle>{label}</DialogTitle>
                <DialogDescription>The Output at full size.</DialogDescription>
              </DialogHeader>
              <img
                className={styles.full}
                src={output.url}
                alt={label}
              />
            </DialogContent>
          </Dialog>
        </>
      );
    case 'video':
      return (
        <video
          className={styles.media}
          src={output.url}
          controls
          preload="metadata"
          aria-label={label}
        />
      );
    case 'audio':
      return (
        <audio
          className={styles.audio}
          src={output.url}
          controls
          preload="metadata"
          aria-label={label}
        />
      );
    case 'model3d':
      return (
        // The custom element needs the browser: never rendered on the server.
        <ClientOnly fallback={<Spinner />}>
          <Suspense fallback={<Spinner />}>
            <ModelViewer
              src={output.url}
              label={label}
            />
          </Suspense>
        </ClientOnly>
      );
  }
}
