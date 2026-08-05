import { createFileRoute } from '@tanstack/react-router';
import { AudioEditorPage } from '@/components/audio-editor/AudioEditorPage';

export const Route = createFileRoute('/_dashboard/tools/audio')({
  head: () => ({ meta: [{ title: 'Audio Tools | LunaShare' }] }),
  component: AudioToolPage,
});

function AudioToolPage() {
  return (
    <div className="h-[calc(100vh-4rem)]">
      <AudioEditorPage />
    </div>
  );
}
