import { Check, Copy, Link2, Lock, MoreHorizontal, Play } from 'lucide-react';
import * as React from 'react';
import { FILE_DRAG_TYPE } from '@/components/dashboard/file-drag';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PREVIEW_MEDIA_ATTR } from '@/libs/preview-morph';
import { cn, getCDNImage, getFileIcon } from '@/libs/utils';
import type { GalleryFile } from '@/types/project';
import styles from './FileCard.module.css';

/** Seconds as m:ss, for the badge on a video or audio card. */
function formatDuration(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function extensionOf(file: GalleryFile): string {
  const match = /\.([a-z0-9]+)$/i.exec(file.title ?? file.url ?? '');
  return match?.[1] ? `.${match[1].toLowerCase()}` : '';
}

export type FileCardProps = {
  file: GalleryFile;
  selected: boolean;
  /** True while any file is selected, which is when every card shows its check. */
  selecting: boolean;
  /** Chips carry their labels unless the owner has asked for icons only. */
  iconOnlyActions: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
  onCopyImage: () => void;
  onCopyLink: () => void;
  /**
   * Every file id this card's drag should carry — itself, or the whole selection
   * when it is part of one.
   */
  dragIds: readonly string[];
  /** The ⋯ menu's items, so the card holds no folder or mutation logic of its own. */
  menuItems: React.ReactNode;
};

/**
 * One file in the gallery.
 *
 * Its two primary actions are Copy image and Copy link, on the card itself
 * rather than behind a menu, because that is what the card is for. Middle-click
 * still opens the direct URL in a new tab — the habit the whole screen is built
 * around, so it survives the redesign unchanged.
 *
 * The selected state is drawn *inside* the media as an inset ring. An outer ring
 * or an `outline` is what the sticky group header used to clip, so neither is
 * used here.
 */
const FileCard = React.memo(function FileCard({
  file,
  selected,
  selecting,
  iconOnlyActions,
  onOpen,
  onToggleSelect,
  onCopyImage,
  onCopyLink,
  dragIds,
  menuItems,
}: FileCardProps) {
  const directUrl = getCDNImage(`/${file.ownerId}/${file.url}`);
  const isImage = file.contentType.startsWith('image/');
  const isVideo = file.contentType.startsWith('video/');
  const duration = file.metadata?.duration ?? null;
  const TypeIcon = getFileIcon(file.contentType);

  /*
   * A plain click opens the Preview, unless something is already selected — then
   * it extends the selection, because that is obviously what a click means while
   * a selection is in progress. A modifier always means "select".
   */
  const handleClick = (event: React.MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || selecting) {
      event.preventDefault();
      onToggleSelect();
      return;
    }
    onOpen();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (selecting) onToggleSelect();
      else onOpen();
      return;
    }

    if (event.key.toLowerCase() === 'c' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      // ⇧⌘C is always the link; ⌘C is the image, or the link when there is no image.
      if (event.shiftKey || !isImage) onCopyLink();
      else onCopyImage();
    }
  };

  return (
    <article
      // biome-ignore lint/a11y/useSemanticElements: a card is a composite — it holds its own buttons and menu, so it cannot be one.
      role="button"
      tabIndex={0}
      aria-label={file.title ?? 'Untitled file'}
      aria-pressed={selected}
      className={styles.root}
      data-selected={selected || undefined}
      data-selecting={selecting || undefined}
      data-vt-name
      style={{ '--vt-name': `c-${file.id}` } as React.CSSProperties}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      // The owner's habit: the middle button opens the file itself, not the app.
      onAuxClick={(event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        window.open(directUrl, '_blank', 'noopener');
      }}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData(FILE_DRAG_TYPE, JSON.stringify(dragIds));
      }}
      // Feeds the cursor spotlight in the module.
      onPointerMove={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty('--mx', `${event.clientX - box.left}px`);
        event.currentTarget.style.setProperty('--my', `${event.clientY - box.top}px`);
      }}
    >
      <div
        className={styles.media}
        {...{ [PREVIEW_MEDIA_ATTR]: file.id }}
      >
        {isImage ? (
          <img
            src={directUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className={styles.image}
          />
        ) : (
          <div className={styles.placeholder}>
            <TypeIcon size={22} />
            <span>{extensionOf(file)}</span>
            {duration !== null && <small>{formatDuration(duration)}</small>}
          </div>
        )}
        <span
          aria-hidden
          className={styles.shade}
        />
      </div>

      <button
        type="button"
        className={styles.check}
        aria-label={selected ? 'Deselect' : 'Select'}
        onClick={(event) => {
          event.stopPropagation();
          onToggleSelect();
        }}
      >
        <Check size={13} />
      </button>

      {file.private && (
        <span className={styles.lockBadge}>
          <Lock size={11} />
          Private
        </span>
      )}

      {isVideo && duration !== null && (
        <span className={styles.durationBadge}>
          <Play size={10} />
          {formatDuration(duration)}
        </span>
      )}

      <div className={styles.actions}>
        {isImage && (
          <button
            type="button"
            className={styles.chip}
            title="Copy image"
            data-icon-only={iconOnlyActions || undefined}
            onClick={(event) => {
              event.stopPropagation();
              onCopyImage();
            }}
          >
            <Copy size={13} />
            {!iconOnlyActions && 'Copy image'}
          </button>
        )}
        <button
          type="button"
          className={styles.chip}
          title="Copy link"
          data-icon-only={iconOnlyActions || undefined}
          onClick={(event) => {
            event.stopPropagation();
            onCopyLink();
          }}
        >
          <Link2 size={13} />
          {!iconOnlyActions && 'Copy link'}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="More actions"
            className={cn(styles.chip, styles.menuChip)}
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontal size={14} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">{menuItems}</DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
});

export { FileCard };
