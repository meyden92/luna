import { HardDriveDownload } from 'lucide-react';
import type React from 'react';

import { downloadImage } from '@/libs/download';
import { cn } from '@/libs/utils';

import { Button } from './button';
import styles from './DownloadButton.module.css';

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
          className={cn(styles.icon, className)}
        />
      ) : (
        <Button onClick={() => downloadImage(url, filename)}>Download</Button>
      )}
    </div>
  );
}

export default DownloadButton;
