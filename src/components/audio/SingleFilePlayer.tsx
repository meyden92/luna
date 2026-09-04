import type React from 'react';
import { useState } from 'react';
import AudioPlayerControls, { type AudioData } from './AudioPlayerControls';
import styles from './SingleFilePlayer.module.css';

interface File {
  id: string;
  title: string | null;
  url: string;
}

interface SingleFilePlayerProps {
  file: File;
}

const SingleFilePlayer: React.FC<SingleFilePlayerProps> = ({ file }) => {
  const [audioData, setAudioData] = useState<AudioData>({
    bassLevel: 0,
    midLevel: 0,
    highLevel: 0,
    overallLevel: 0,
    frequencyData: new Uint8Array(0),
  });
  const [isPlaying, setIsPlaying] = useState(false);

  const handleAudioDataChange = (newAudioData: AudioData) => {
    setAudioData(newAudioData);
    // You can use audioData for visualizations or other purposes
  };

  const handlePlayingChange = (playing: boolean) => {
    setIsPlaying(playing);
    // You can use this to update UI or trigger other actions
  };

  return (
    <div className={`${styles.root} margin-x-auto`}>
      {/* Optional: Display current file info */}
      <div className={`${styles.header} pad-4`}>
        <h3 className={styles.title}>{file.title || 'Untitled'}</h3>
        <div className={styles.status}>Status: {isPlaying ? 'Playing' : 'Paused'}</div>
      </div>

      {/* Optional: Simple visualizer using audio data */}
      <div className={styles.meter}>
        <div className={styles.bars}>
          {Array.from({ length: 20 }, (_, i) => `bar-${i}`).map((barId) => (
            <div
              key={barId}
              className={styles.bar}
              style={{
                height: `${Math.max(2, audioData.overallLevel * 64)}px`,
                opacity: isPlaying ? 0.8 : 0.3,
              }}
            />
          ))}
        </div>
      </div>

      {/* Audio Player Controls */}
      <AudioPlayerControls
        file={file}
        onAudioDataChange={handleAudioDataChange}
        onPlayingChange={handlePlayingChange}
      />
    </div>
  );
};

export default SingleFilePlayer;
