import { ChevronLeft, ChevronRight, File, Loader2 } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getFileIcon } from '@/libs/utils';
import styles from './Preview.module.css';
import { PreviewPanel } from './PreviewPanel';
import { PreviewStrip } from './PreviewStrip';
import { copyPreviewImage, copyPreviewLink } from './preview-clipboard';
import { isPreviewImage, type PreviewFile, previewExtensionLabel, previewFileUrl } from './preview-file';

export type { PreviewFile } from './preview-file';

export type PreviewProps = {
  /** The file on the stage, or null when the Preview is closed. */
  fileId: string | null;
  /** The current filtered, sorted list — arrow keys walk this, not upload order. */
  files: readonly PreviewFile[];
  onClose: () => void;
  onNavigate: (fileId: string) => void;
  onDelete: (fileId: string) => void;
  onMoveToFolder: (fileId: string, folderId: string | null) => void;
  onVisibilityChange: (fileId: string, isPrivate: boolean) => void;
  /** Fetches the gallery's next page; absent when everything has loaded. */
  onLoadMore?: () => void;
  loadingMore: boolean;
};

/** How many neighbours either side are fetched ahead so ← → feel instant. */
const PRELOAD_NEIGHBOURS = 2;
/** Minimum gap between wheel steps, so one flick of a trackpad is one file. */
const WHEEL_THROTTLE_MS = 120;
/** How close to the end of what has loaded, in files, before the next page is fetched. */
const LOAD_MORE_THRESHOLD = 5;
/** Horizontal travel a touch needs before it counts as a swipe. */
const SWIPE_THRESHOLD_PX = 60;

/** A keystroke aimed at a field is the field's, not the Preview's. */
function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
      Boolean(target.closest('[data-slot="dialog-content"], [data-slot="alert-dialog-content"]')))
  );
}

/** A touch that starts on a control belongs to the control, not the swipe. */
function isInteractiveTouchTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('button, a, input, textarea, select, video, audio, [role="button"]'));
}

/**
 * Reveals the image once it has decoded. Set on the element rather than through
 * state so a cached image is marked inside the same commit — the open morph
 * snapshots it straight away and must not catch it transparent.
 */
function markLoadedIfComplete(image: HTMLImageElement | null) {
  if (image?.complete && image.naturalWidth > 0) image.dataset.loaded = '';
}

/** Warm the browser cache for the images ← → would land on next. */
function NeighbourPreload({ files, index }: { files: readonly PreviewFile[]; index: number }) {
  const urls: string[] = [];
  for (let offset = 1; offset <= PRELOAD_NEIGHBOURS; offset++) {
    for (const neighbour of [files[index + offset], files[index - offset]]) {
      if (neighbour && isPreviewImage(neighbour.mimeType)) urls.push(previewFileUrl(neighbour));
    }
  }

  return (
    <>
      {urls.map((url) => (
        <link
          key={url}
          rel="preload"
          as="image"
          href={url}
        />
      ))}
    </>
  );
}

/**
 * Full-screen Preview: the image on a dark stage, a filmstrip of the loaded
 * files, and a panel of everything that can be done with the file. The gallery
 * owns which file is open and hands the whole filtered, sorted list over, so
 * ← → and the wheel walk what the owner is looking at.
 */
export function Preview({
  fileId,
  files,
  onClose,
  onNavigate,
  onDelete,
  onMoveToFolder,
  onVisibilityChange,
  onLoadMore,
  loadingMore,
}: PreviewProps) {
  const index = fileId === null ? -1 : files.findIndex((candidate) => candidate.id === fileId);
  const file = index === -1 ? undefined : files[index];
  const previous = index > 0 ? files[index - 1] : undefined;
  const next = index === -1 ? undefined : files[index + 1];
  const isOpen = file !== undefined;
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastLoadIndexRef = useRef(-1);

  useEffect(() => {
    if (!file) return;

    const isImage = isPreviewImage(file.mimeType);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (previous) onNavigate(previous.id);
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        if (next) onNavigate(next.id);
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (event.repeat) return;
        event.preventDefault();
        onDelete(file.id);
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        // ⇧⌘C is always the link; so is plain ⌘C when there is no image to copy.
        if (event.shiftKey || !isImage) {
          void copyPreviewLink(file);
        } else {
          void copyPreviewImage(file);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [file, previous, next, onClose, onNavigate, onDelete]);

  // The wheel over the stage steps through files; the strip and panel scroll natively.
  useEffect(() => {
    if (!isOpen) return;
    let lastWheelTime = 0;

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || !(event.target instanceof Node) || !stageRef.current?.contains(event.target)) return;
      const now = Date.now();
      if (now - lastWheelTime < WHEEL_THROTTLE_MS) return;
      const target = event.deltaY > 0 ? next : event.deltaY < 0 ? previous : undefined;
      if (!target) return;

      lastWheelTime = now;
      event.preventDefault();
      onNavigate(target.id);
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [isOpen, previous, next, onNavigate]);

  // Walking towards the end of what has loaded fetches the next page, once per position.
  useEffect(() => {
    if (!onLoadMore || loadingMore || index === -1) return;
    if (index >= files.length - LOAD_MORE_THRESHOLD && lastLoadIndexRef.current < index) {
      lastLoadIndexRef.current = index;
      onLoadMore();
    }
  }, [onLoadMore, loadingMore, index, files.length]);

  // The stage covers the page; the page behind it must not scroll under it.
  useEffect(() => {
    if (!isOpen) return;
    const restoreOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = restoreOverflow;
    };
  }, [isOpen]);

  // Focus moves into the Preview and stays there while it is open, then returns
  // to whatever opened it — the card, so ← → and Esc keep working afterwards.
  useEffect(() => {
    if (!isOpen) return;
    const restoreFocusTo = document.activeElement as HTMLElement | null;
    const container = containerRef.current;
    container?.focus();

    const trapTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !container) return;
      const focusable = container.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    container?.addEventListener('keydown', trapTab);
    return () => {
      container?.removeEventListener('keydown', trapTab);
      restoreFocusTo?.focus();
    };
  }, [isOpen]);

  if (!file || typeof document === 'undefined') return null;

  const isImage = isPreviewImage(file.mimeType);
  const PlaceholderIcon = getFileIcon(file.mimeType ?? '');
  // A click anywhere on the backdrop closes; a click on the file itself must not.
  const keepOpen = (event: React.MouseEvent) => event.stopPropagation();

  const handleTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0];
    touchStartRef.current = touch && !isInteractiveTouchTarget(event.target) ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const handleTouchEnd = (event: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch || isInteractiveTouchTarget(event.target)) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return;
    const target = deltaX < 0 ? next : previous;
    if (target) onNavigate(target.id);
  };

  return createPortal(
    <div
      ref={containerRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={file.name}
      className={styles.root}
    >
      <NeighbourPreload
        files={files}
        index={index}
      />

      <div
        ref={stageRef}
        className={styles.stage}
        onClick={onClose}
        onTouchStartCapture={handleTouchStart}
        onTouchEndCapture={handleTouchEnd}
      >
        {isImage ? (
          // The card lends this <img> the shared `preview-media` name for the
          // length of the morph: src/libs/preview-morph.ts puts it on the
          // thumbnail for the "before" snapshot and the name lands here for the
          // "after" one, so the browser tweens one element between the two.
          <>
            <img
              key={file.id}
              ref={markLoadedIfComplete}
              src={previewFileUrl(file)}
              alt={file.name}
              className={styles.image}
              style={{ viewTransitionName: 'preview-media' }}
              onClick={keepOpen}
              onLoad={(event) => {
                event.currentTarget.dataset.loaded = '';
              }}
              onError={(event) => {
                event.currentTarget.dataset.error = '';
              }}
            />
            {/* Shown by Preview.module.css only while the image above is loading or has failed. */}
            <Loader2
              className={styles.spinner}
              aria-hidden
            />
            <div className={styles.fallback}>
              <File size={64} />
              <p>Failed to load image</p>
            </div>
          </>
        ) : (
          <div
            className={styles.placeholder}
            onClick={keepOpen}
          >
            <PlaceholderIcon size={40} />
            <span>{previewExtensionLabel(file)}</span>
          </div>
        )}

        {previous && (
          <button
            type="button"
            className={styles.nav}
            data-side="start"
            aria-label="Previous file"
            onClick={(event) => {
              event.stopPropagation();
              onNavigate(previous.id);
            }}
          >
            <ChevronLeft size={20} />
          </button>
        )}
        {next && (
          <button
            type="button"
            className={styles.nav}
            data-side="end"
            aria-label="Next file"
            onClick={(event) => {
              event.stopPropagation();
              onNavigate(next.id);
            }}
          >
            <ChevronRight size={20} />
          </button>
        )}

        <p className={styles.counter}>
          {index + 1} / {files.length}
          {loadingMore ? '…' : ''}
        </p>
      </div>

      <PreviewStrip
        files={files}
        index={index}
        onNavigate={onNavigate}
      />

      <PreviewPanel
        file={file}
        onClose={onClose}
        onDelete={onDelete}
        onMoveToFolder={onMoveToFolder}
        onVisibilityChange={onVisibilityChange}
      />
    </div>,
    document.body,
  );
}
