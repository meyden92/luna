import { FileText, Film, Globe, Image as ImageIcon, Lock, Music, Upload, X } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { UPLOAD_ACCEPT } from '@/components/uploader/upload-transport';
import { formatSize } from '@/libs/utils';
import styles from './UploadSheet.module.css';

/** Who can open the links of the files in this batch. */
export type UploadPrivacy = 'public' | 'private';

/** One file waiting to go, or going. */
export interface UploadQueueItem {
  id: string;
  file: File;
  /** 0–100, from the request's own progress events. Stays 0 until the upload starts. */
  progress: number;
  /** An object URL, so an image row shows the picture rather than an icon. */
  previewUrl: string | null;
}

/**
 * The Select's "no folder" choice. Base UI needs a real value for every item,
 * so the absence of a folder travels as this sentinel and becomes null again at
 * the boundary.
 */
const NO_FOLDER = 'none';

interface UploadSheetProps {
  open: boolean;
  queue: readonly UploadQueueItem[];
  /** True from the moment Upload is pressed until the batch settles. */
  busy: boolean;
  folders: readonly { id: string; name: string }[];
  folderId: string | null;
  privacy: UploadPrivacy;
  copyLink: boolean;
  onOpenChange: (open: boolean) => void;
  onAddFiles: (files: readonly File[]) => void;
  onRemoveFile: (id: string) => void;
  onFolderChange: (folderId: string | null) => void;
  onPrivacyChange: (privacy: UploadPrivacy) => void;
  onCopyLinkChange: (copyLink: boolean) => void;
  onUpload: () => void;
}

function QueueItemIcon({ contentType }: { contentType: string }) {
  if (contentType.startsWith('image/')) return <ImageIcon className={styles.queueIcon} />;
  if (contentType.startsWith('video/')) return <Film className={styles.queueIcon} />;
  if (contentType.startsWith('audio/')) return <Music className={styles.queueIcon} />;
  return <FileText className={styles.queueIcon} />;
}

/**
 * A queue row. While the batch is uploading the remove button gives way to the
 * percentage and the bar, because a file already on the wire cannot be dropped
 * from the batch.
 */
function QueueRow({ item, busy, onRemove }: { item: UploadQueueItem; busy: boolean; onRemove: (id: string) => void }) {
  const percent = Math.round(item.progress);

  return (
    <li className={styles.queueItem}>
      <div className={styles.queueThumb}>
        {item.previewUrl ? (
          <img
            src={item.previewUrl}
            alt=""
          />
        ) : (
          <QueueItemIcon contentType={item.file.type} />
        )}
      </div>

      <div className={styles.queueText}>
        <div className={styles.queueName}>{item.file.name}</div>
        <div className={styles.queueMeta}>
          {formatSize(item.file.size, { precision: 1, trim: true })}
          {busy ? (percent >= 100 ? ' · Done' : ` · ${percent}%`) : ''}
        </div>
        {busy && (
          <div className={styles.queueBar}>
            <span
              className={styles.queueBarFill}
              style={{ '--upload-progress': `${percent}%` } as React.CSSProperties}
            />
          </div>
        )}
      </div>

      {!busy && (
        <Button
          variant="ghost"
          size="icon-sm"
          className={styles.queueRemove}
          aria-label={`Remove ${item.file.name}`}
          onClick={() => onRemove(item.id)}
        >
          <X />
        </Button>
      )}
    </li>
  );
}

/**
 * The upload surface: a 440px right sheet holding the drop zone, the queue and
 * the three choices that apply to the whole batch. It owns no upload state —
 * `UploadSheetProvider` does, because the same queue is fed by the nav button, a
 * window drop and a ⌘V paste.
 */
export function UploadSheet({
  open,
  queue,
  busy,
  folders,
  folderId,
  privacy,
  copyLink,
  onOpenChange,
  onAddFiles,
  onRemoveFile,
  onFolderChange,
  onPrivacyChange,
  onCopyLinkChange,
  onUpload,
}: UploadSheetProps) {
  const fileInput = React.useRef<HTMLInputElement>(null);
  // Set while files hover the zone itself. The provider's drag state clears on
  // drop, so this never has to be reset by hand.
  const [hovered, setHovered] = React.useState(false);

  const count = queue.length;
  const uploadLabel = busy ? 'Uploading…' : count > 0 ? `Upload ${count} ${count === 1 ? 'file' : 'files'}` : 'Upload';

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
    >
      <SheetContent
        side="right"
        className={styles.sheet}
      >
        <SheetHeader>
          <SheetTitle>Upload files</SheetTitle>
          <SheetDescription>Files land at the top of Today.</SheetDescription>
        </SheetHeader>

        <div className={styles.body}>
          {/* The window owns every drop (see UploadSheetProvider), so this zone
              only reports that files are over it and offers the file picker. */}
          <button
            type="button"
            className={styles.dropZone}
            data-hot={hovered || undefined}
            onClick={() => fileInput.current?.click()}
            onDragEnter={() => setHovered(true)}
            onDragLeave={(event) => {
              // The children fire dragleave too; only a drag that has really
              // left the zone should drop the highlight.
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHovered(false);
            }}
            onDrop={() => setHovered(false)}
          >
            <span className={styles.dropIcon}>
              <Upload />
            </span>
            <strong className={styles.dropTitle}>Drop files or click to browse</strong>
            <span className={styles.dropHint}>Or drag anywhere on the page · paste with ⌘V</span>
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            accept={UPLOAD_ACCEPT}
            onChange={(event) => {
              const picked = event.target.files;
              if (picked && picked.length > 0) onAddFiles(Array.from(picked));
              // Cleared so picking the same file twice still fires a change.
              event.target.value = '';
            }}
          />

          {count > 0 && (
            <ul className={styles.queue}>
              {queue.map((item) => (
                <QueueRow
                  key={item.id}
                  item={item}
                  busy={busy}
                  onRemove={onRemoveFile}
                />
              ))}
            </ul>
          )}

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Folder</span>
            <Select
              value={folderId ?? NO_FOLDER}
              onValueChange={(value) => onFolderChange(value === NO_FOLDER ? null : String(value))}
            >
              <SelectTrigger
                size="sm"
                aria-label="Folder"
                className={styles.fieldControl}
              >
                {/* The trigger has to name the folder before the popup has ever
                    been opened, which Base UI can only do from a render function. */}
                <SelectValue>{(value) => folders.find((folder) => folder.id === value)?.name ?? 'Not in a folder'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_FOLDER}>Not in a folder</SelectItem>
                {folders.map((folder) => (
                  <SelectItem
                    key={folder.id}
                    value={folder.id}
                  >
                    {folder.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Who can open the link</span>
            <ToggleGroup
              variant="outline"
              size="sm"
              value={[privacy]}
              className={styles.visibility}
              onValueChange={(values) => {
                // Clicking the active option clears the group; the batch always
                // has a visibility, so that clearing is ignored.
                const next = values[values.length - 1];
                if (next === 'public' || next === 'private') onPrivacyChange(next);
              }}
            >
              <ToggleGroupItem value="public">
                <Globe />
                Anyone with the link
              </ToggleGroupItem>
              <ToggleGroupItem value="private">
                <Lock />
                Only me
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className={styles.fieldRow}>
            <div>
              <span className={styles.fieldLabel}>Copy link when done</span>
              <small className={styles.fieldHint}>For a single file, its link goes straight to your clipboard</small>
            </div>
            <Switch
              checked={copyLink}
              aria-label="Copy link when done"
              onCheckedChange={onCopyLinkChange}
            />
          </div>
        </div>

        <SheetFooter className={styles.footer}>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={busy || count === 0}
            onClick={onUpload}
          >
            {uploadLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
