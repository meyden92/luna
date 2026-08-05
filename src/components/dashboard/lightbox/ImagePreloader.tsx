import { getCDNImage, isPreviewableFile } from '@/libs/utils';

interface FileData {
  id: string;
  url: string;
  contentType: string;
}

interface ImagePreloaderProps {
  files: FileData[];
  currentIndex: number;
  userId: string;
  preloadCount?: number;
}

function buildCdnUrl(userId: string, url: string) {
  return getCDNImage(`/${userId}/${url}`);
}

export function ImagePreloader({ files, currentIndex, userId, preloadCount = 2 }: ImagePreloaderProps) {
  const urls: string[] = [];

  for (let offset = 1; offset <= preloadCount; offset++) {
    const nextFile = files[currentIndex + offset];
    const prevFile = files[currentIndex - offset];

    if (nextFile && isPreviewableFile(nextFile.contentType)) urls.push(buildCdnUrl(userId, nextFile.url));
    if (prevFile && isPreviewableFile(prevFile.contentType)) urls.push(buildCdnUrl(userId, prevFile.url));
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
