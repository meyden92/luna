import { Download, ExternalLink, FileIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { file } from '@/db/schema/files';
import { formatSize, getCDNImage } from '@/libs/utils';

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
    <div className="space-y-4">
      {/* File Info */}
      <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
        <div>
          <label className="text-sm font-medium text-muted-foreground">File ID</label>
          <p className="font-mono text-sm">{file.id}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Size</label>
          <p className="text-sm">{formatSize(file.size, ADMIN_FILE_SIZE_OPTIONS)}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Type</label>
          <p className="text-sm">{file.contentType}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Created</label>
          <p className="text-sm">{new Date(file.createdAt).toLocaleDateString()}</p>
        </div>
      </div>

      {/* File Preview */}
      <div className="flex justify-center items-center min-h-[300px] max-h-[40vh] bg-muted/30 rounded-lg overflow-hidden">
        {isImage && !imageError ? (
          <img
            src={fileUrl}
            alt={file.title}
            className="max-w-full max-h-full object-contain"
            onError={() => setImageError(true)}
          />
        ) : isVideo ? (
          <video
            src={fileUrl}
            controls
            className="max-w-full max-h-full"
            preload="metadata"
          >
            Your browser does not support the video tag.
          </video>
        ) : isAudio ? (
          <div className="w-full max-w-md">
            <audio
              src={fileUrl}
              controls
              className="w-full"
              preload="metadata"
            >
              Your browser does not support the audio tag.
            </audio>
          </div>
        ) : isPdf ? (
          <iframe
            src={fileUrl}
            className="w-full h-[40vh] border-0"
            title={file.title}
          />
        ) : (
          <div className="text-center text-muted-foreground">
            <FileIcon className="h-16 w-16 mx-auto mb-4" />
            <p>Preview not available for this file type</p>
            <p className="text-sm mt-2">{file.contentType}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-center">
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
          <ExternalLink className="h-4 w-4 mr-2" />
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
          <Download className="h-4 w-4 mr-2" />
          Download
        </Button>
      </div>
    </div>
  );
}
