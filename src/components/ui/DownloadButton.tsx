import { HardDriveDownload } from 'lucide-react';
import type React from 'react';

import { downloadImage } from '@/libs/download';
import { cn } from '@/libs/utils';

import { Button } from './button';

interface DownloadButtonProps extends React.HTMLAttributes<HTMLDivElement> {
  url: string;
  filename: string;
  small?: boolean;
}

function DownloadButton({ url, filename, small = false, className }: DownloadButtonProps) {
  return (
    <div className={className}>
      {small ? (
        <HardDriveDownload
          onClick={() => downloadImage(url, filename)}
          className={cn('cursor-pointer bg-muted p-1 transition hover:bg-muted/80', className)}
        />
      ) : (
        <Button onClick={() => downloadImage(url, filename)}>Download</Button>
      )}
    </div>
  );
}

export default DownloadButton;
