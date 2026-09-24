import { Copy, Download, ExternalLink, Link2, Trash2, X } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useFolders } from '@/contexts/FoldersContext';
import { formatSize } from '@/libs/utils';
import styles from './PreviewPanel.module.css';
import { copyPreviewImage, copyPreviewLink } from './preview-clipboard';
import { formatUploadedAt, isPreviewImage, type PreviewFile, previewFileUrl, previewTypeLabel } from './preview-file';

/**
 * The Select has to speak in strings, so the absence of a folder gets a value of
 * its own rather than being expressed as the empty string, which Base UI treats
 * as "nothing chosen".
 */
const NO_FOLDER = 'none';

type PreviewPanelProps = {
  file: PreviewFile;
  onClose: () => void;
  onDelete: (fileId: string) => void;
  onMoveToFolder: (fileId: string, folderId: string | null) => void;
  onVisibilityChange: (fileId: string, isPrivate: boolean) => void;
};

/**
 * The Preview's right-hand column: what the file is, the two copy actions the
 * whole app is built around, then the things that change it — folder, privacy —
 * and finally the one destructive action, kept at the bottom out of reach.
 */
export function PreviewPanel({ file, onClose, onDelete, onMoveToFolder, onVisibilityChange }: PreviewPanelProps) {
  const { folders } = useFolders();
  // Base UI needs the value → label map to put a name on the closed trigger,
  // and the same list renders the popup, so the two can never disagree.
  const folderOptions = useMemo(
    () => [{ value: NO_FOLDER, label: 'Not in a folder' }, ...folders.map((folder) => ({ value: folder.id, label: folder.name }))],
    [folders],
  );
  const isImage = isPreviewImage(file.mimeType);
  const typeLabel = previewTypeLabel(file);
  const sizeLabel = formatSize(file.size, { precision: 1, trim: true });
  const uploadedLabel = formatUploadedAt(file.createdAt);

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.identity}>
          <h2 className={styles.name}>{file.name}</h2>
          <p className={styles.meta}>
            {typeLabel} · {sizeLabel} · {uploadedLabel}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close (Esc)"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>

      {/*
       * A non-image has no image to copy, so Copy link becomes the primary
       * action and inherits ⌘C — the chips say so, matching what the keyboard
       * handler in Preview.tsx actually does.
       */}
      <div className={styles.actions}>
        {isImage && (
          <Button onClick={() => void copyPreviewImage(file)}>
            <Copy />
            Copy image
            <kbd className={styles.kbd}>⌘C</kbd>
          </Button>
        )}
        <Button
          variant={isImage ? 'outline' : 'default'}
          onClick={() => void copyPreviewLink(file)}
        >
          <Link2 />
          Copy link
          <kbd className={styles.kbd}>{isImage ? '⇧⌘C' : '⌘C'}</kbd>
        </Button>
      </div>

      <div className={styles.links}>
        <a
          className={styles.link}
          href={previewFileUrl(file)}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={14} />
          Open direct link
        </a>
        <a
          className={styles.link}
          href={previewFileUrl(file)}
          download={file.name}
        >
          <Download size={14} />
          Download
        </a>
      </div>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Folder</span>
        <Select
          items={folderOptions}
          value={file.folderId ?? NO_FOLDER}
          onValueChange={(value) => onMoveToFolder(file.id, value === NO_FOLDER ? null : String(value))}
        >
          <SelectTrigger
            size="sm"
            className={styles.selectTrigger}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {folderOptions.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className={styles.row}>
        <div>
          <span className={styles.fieldLabel}>Private</span>
          <small className={styles.hint}>Only you can open the link</small>
        </div>
        <Switch
          checked={file.isPrivate}
          onCheckedChange={(checked) => onVisibilityChange(file.id, checked)}
          aria-label="Private"
        />
      </div>

      <dl className={styles.details}>
        <dt>Type</dt>
        <dd>{typeLabel}</dd>
        <dt>Size</dt>
        <dd>{sizeLabel}</dd>
        {file.width !== null && file.height !== null && (
          <>
            <dt>Dimensions</dt>
            <dd>
              {file.width} × {file.height}
            </dd>
          </>
        )}
        <dt>Uploaded</dt>
        <dd>{uploadedLabel}</dd>
      </dl>

      <div className={styles.footer}>
        <Button
          variant="ghost"
          className={styles.delete}
          onClick={() => onDelete(file.id)}
        >
          <Trash2 />
          Delete file
        </Button>
      </div>
    </aside>
  );
}
