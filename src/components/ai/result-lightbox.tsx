import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import styles from './result-lightbox.module.css';

interface ResultLightboxProps {
  src: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Open full size" from a result tile: the generated image at its own size, with
 * nothing else on screen. Anything more (folder, privacy, delete) belongs to the
 * file in Files, which is where the image already lives.
 */
function ResultLightbox({ src, open, onOpenChange }: ResultLightboxProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent
        size="full"
        className={styles.popup}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Generated image</DialogTitle>
          <DialogDescription>The result at full size.</DialogDescription>
        </DialogHeader>
        <img
          className={styles.image}
          src={src}
          alt=""
        />
      </DialogContent>
    </Dialog>
  );
}

export { ResultLightbox };
