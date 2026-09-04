import { Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import styles from './VideoContainer.module.css';

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
    <div className={styles.root}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.source}>{src}</p>

      <div className={styles.frame}>
        {isLoading && (
          <div className={styles.loading}>
            <Loader2 className={styles.spinner} />
          </div>
        )}

        <video
          ref={videoRef}
          src={src}
          controls
          controlsList="nodownload"
          onLoadedData={handleLoadedData}
          onError={onError}
          className={styles.video}
          data-ready={isLoading ? undefined : ''}
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
