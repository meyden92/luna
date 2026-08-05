import { Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { cn } from '@/libs/utils';

interface VideoContainerProps {
  src: string;
  title: string;
  onError?: () => void;
}

function VideoContainer({ src, title, onError }: VideoContainerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleLoadedData = () => {
    setIsLoading(false);
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-3">
      <h1 className="text-2xl font-semibold truncate antialiased">{title}</h1>
      <p className="text-sm text-muted-foreground truncate">{src}</p>

      <div className="relative aspect-video bg-black/5 rounded-lg overflow-hidden shadow-sm">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        <video
          ref={videoRef}
          src={src}
          controls
          controlsList="nodownload"
          onLoadedData={handleLoadedData}
          onError={onError}
          className={cn('w-full h-full object-contain', isLoading ? 'opacity-0' : 'opacity-100 transition-opacity duration-300')}
        >
          <track
            kind="captions"
            src=""
            label="English"
          />
        </video>
      </div>
    </div>
  );
}

export default VideoContainer;
