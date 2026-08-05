import type React from 'react';
import { useState } from 'react';
import AudioPlayerControls, { type AudioData } from './AudioPlayerControls';

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
    <div className="w-full max-w-2xl mx-auto">
      {/* Optional: Display current file info */}
      <div className="p-4 text-center">
        <h3 className="text-lg font-semibold text-white mb-2">{file.title || 'Untitled'}</h3>
        <div className="text-sm text-gray-400">Status: {isPlaying ? 'Playing' : 'Paused'}</div>
      </div>

      {/* Optional: Simple visualizer using audio data */}
      <div className="h-20 bg-gray-800 mb-4 flex items-center justify-center">
        <div className="flex items-end gap-1 h-16">
          {Array.from({ length: 20 }, (_, i) => `bar-${i}`).map((barId) => (
            <div
              key={barId}
              className="w-2 bg-blue-500 rounded-t transition-all duration-100"
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
