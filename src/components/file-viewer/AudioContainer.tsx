import AudioPlayer from 'react-h5-audio-player';
import 'react-h5-audio-player/lib/styles.css';
import { useRef } from 'react';
import type H5AudioPlayer from 'react-h5-audio-player';

export type AudioMetadata = {
  artist: string | null;
  lyrics: string | null;
  duration: number | null;
};

const SongDetails = ({ data, title }: { data: AudioMetadata; title: string }) => {
  if (!data.duration && !data.artist && !data.lyrics) return null;

  return (
    <div className="mt-6 p-6 bg-white/10 backdrop-blur-xs rounded-lg shadow-lg">
      {(title || data.artist) && (
        <div className="mb-4">
          {title && <h2 className="text-xl font-semibold text-primary">{title}</h2>}
          {data.artist && <p className="text-sm text-muted-foreground mt-1">by {data.artist}</p>}
        </div>
      )}

      {data.lyrics && (
        <div>
          <h3 className="text-md font-medium mb-2 text-foreground">Lyrics</h3>
          <p className="whitespace-pre-line text-muted-foreground font-light leading-relaxed">{data.lyrics}</p>
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
    <div className="flex flex-col items-center justify-center h-full">
      <div className="w-full max-w-3xl">
        <div className="flex flex-col items-center mb-1 h-[120px]">
          <div className="transition-opacity duration-300 opacity-100">
            <h2 className="text-lg font-semibold">{title}</h2>
          </div>
        </div>
        <AudioPlayer
          ref={audioRef}
          className="bg-white shadow-lg rounded-lg overflow-hidden"
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
