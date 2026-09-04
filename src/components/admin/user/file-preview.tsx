import { Download, ExternalLink, FileIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { file } from '@/db/schema/files';
import { formatSize, getCDNImage } from '@/libs/utils';
import styles from './file-preview.module.css';

type File = typeof file.$inferSelect;
interface FilePreviewProps {
  file: File;
}

const ADMIN_FILE_SIZE_OPTIONS = { byteUnit: 'Bytes', trim: true } as const;

export default function FilePreview({ file }: FilePreviewProps) {
  const [imageError, setImageError] = useState(false);

  const fileUrl = getCDNImage(`/${file.ownerId}/${file.url}`);
  const isImage = file.contentType.startsWith('image/');
  const isVideo = file.contentType.startsWith('video/');
  const isAudio = file.contentType.startsWith('audio/');
  const isPdf = file.contentType === 'application/pdf';

  return (
    <div className="stack space-4">
      {/* File Info */}
      <div className={styles.info}>
        <div>
          <label className={styles.infoLabel}>File ID</label>
          <p
            className={styles.infoValue}
            data-mono="true"
          >
            {file.id}
          </p>
        </div>
        <div>
          <label className={styles.infoLabel}>Size</label>
          <p className={styles.infoValue}>{formatSize(file.size, ADMIN_FILE_SIZE_OPTIONS)}</p>
        </div>
        <div>
          <label className={styles.infoLabel}>Type</label>
          <p className={styles.infoValue}>{file.contentType}</p>
        </div>
        <div>
          <label className={styles.infoLabel}>Created</label>
          <p className={styles.infoValue}>{new Date(file.createdAt).toLocaleDateString()}</p>
        </div>
      </div>

      {/* File Preview */}
      <div className={styles.stage}>
        {isImage && !imageError ? (
          <img
            src={fileUrl}
            alt={file.title}
            className={styles.image}
            onError={() => setImageError(true)}
          />
        ) : isVideo ? (
          <video
            src={fileUrl}
            controls
            className={styles.video}
            preload="metadata"
          >
            Your browser does not support the video tag.
          </video>
        ) : isAudio ? (
          <div className={styles.audioWrap}>
            <audio
              src={fileUrl}
              controls
              className={styles.audio}
              preload="metadata"
            >
              Your browser does not support the audio tag.
            </audio>
          </div>
        ) : isPdf ? (
          <iframe
            src={fileUrl}
            className={styles.pdf}
            title={file.title}
          />
        ) : (
          <div className={styles.unsupported}>
            <FileIcon className={styles.unsupportedIcon} />
            <p>Preview not available for this file type</p>
            <p className={styles.unsupportedType}>{file.contentType}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <Button
          variant="outline"
          render={
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
        >
          <ExternalLink />
          Open in New Tab
        </Button>
        <Button
          variant="outline"
          render={
            <a
              href={fileUrl}
              download={file.title}
            />
          }
        >
          <Download />
          Download
        </Button>
      </div>
    </div>
  );
}
