import { Download, FolderInput, Link2, Trash2, X } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import MoveToFolderMenu from '@/components/dashboard/MoveToFolderMenu';
import { AnimatedCount } from '@/components/ui/animated-count';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { useClipboard } from '@/hooks/use-copy-to-clipboard';
import { cn } from '@/libs/utils';
import styles from './SelectionBar.module.css';

type SelectionBarProps = {
  fileIds: string[];
  onClear: () => void;
  onDelete: () => void;
};

/**
 * The bar that appears while files are selected.
 *
 * It is centred over the content column rather than the viewport, so the folder
 * sidebar does not push it visually off-centre, and its colours are inverted —
 * it is a temporary mode, and it should not read as part of the page.
 */
function SelectionBar({ fileIds, onClear, onDelete }: SelectionBarProps) {
  const clipboard = useClipboard();
  const [preparing, setPreparing] = React.useState(false);

  const copyLinks = () => {
    clipboard.copy(fileIds.map((id) => `${window.location.origin}/view/${id}`).join('\n'));
    toast.success(fileIds.length === 1 ? 'Link copied' : `${fileIds.length} links copied`);
  };

  const download = async () => {
    setPreparing(true);
    try {
      const response = await fetch('/api/download-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileIds }),
      });
      if (!response.ok) throw new Error(`Download failed (${response.status})`);

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'lunashare-files.zip';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Download failed');
    } finally {
      setPreparing(false);
    }
  };

  return (
    <div
      className={styles.root}
      role="toolbar"
      aria-label="Selected files"
    >
      <span className={styles.count}>
        <AnimatedCount
          value={fileIds.length}
          className={styles.countValue}
        />{' '}
        selected
      </span>

      <button
        type="button"
        className={styles.action}
        onClick={copyLinks}
      >
        <Link2 size={14} />
        Copy links
      </button>

      <button
        type="button"
        className={styles.action}
        disabled={preparing}
        onClick={download}
      >
        {preparing ? <Spinner /> : <Download size={14} />}
        {preparing ? 'Preparing…' : 'Download'}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger className={styles.action}>
          <FolderInput size={14} />
          Move to
        </DropdownMenuTrigger>
        {/* Opens upward: the bar is 24px from the bottom of the window. */}
        <DropdownMenuContent
          side="top"
          align="start"
          className={styles.menu}
        >
          <MoveToFolderMenu
            asDropdown
            flat
            fileIds={fileIds}
            onClose={onClear}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      <span
        aria-hidden
        className={styles.divider}
      />

      <button
        type="button"
        className={cn(styles.action, styles.danger)}
        onClick={onDelete}
      >
        <Trash2 size={14} />
        Delete
      </button>

      <button
        type="button"
        className={styles.action}
        aria-label="Clear selection"
        onClick={onClear}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export { SelectionBar };
