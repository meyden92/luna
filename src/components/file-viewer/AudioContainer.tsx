import AudioPlayer from 'react-h5-audio-player';
import 'react-h5-audio-player/lib/styles.css';
import { useRef } from 'react';
import type H5AudioPlayer from 'react-h5-audio-player';
import styles from './AudioContainer.module.css';

export type AudioMetadata = {
  artist: string | null;
  lyrics: string | null;
  duration: number | null;
};

const SongDetails = ({ data, title }: { data: AudioMetadata; title: string }) => {
  if (!data.duration && !data.artist && !data.lyrics) return null;

  return (
    <div className={styles.details}>
      {(title || data.artist) && (
        <div className={styles.detailsHeader}>
          {title && <h2 className={styles.songTitle}>{title}</h2>}
          {data.artist && <p className={styles.artist}>by {data.artist}</p>}
        </div>
      )}

      {data.lyrics && (
        <div>
          <h3 className={styles.lyricsHeading}>Lyrics</h3>
          <p className={styles.lyrics}>{data.lyrics}</p>
        </div>
      )}
    </div>
  );
};

export default function AudioContainer({
  src,
  title = 'Untitled Audio',
  data,
  onError,
}: {
  src: string;
  title: string;
  data: AudioMetadata | null;
  onError?: () => void;
}) {
  const audioRef = useRef<H5AudioPlayer>(null);

  return (
    <div className={styles.root}>
      <div className={styles.inner}>
        <div className={styles.titleBlock}>
          <h2 className={styles.title}>{title}</h2>
        </div>
        <AudioPlayer
          ref={audioRef}
          className={styles.player}
          src={src}
          autoPlay={false}
          showJumpControls={true}
          volume={0.5}
          onError={onError}
          autoPlayAfterSrcChange={false}
        />
        {data && (
          <SongDetails
            data={data}
            title={title}
          />
        )}
      </div>
    </div>
  );
}
