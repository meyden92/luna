import { createFileRoute } from '@tanstack/react-router';
import { VideoEditorPage } from '@/components/video-editor/VideoEditorPage';

export const Route = createFileRoute('/_dashboard/tools/video')({
  head: () => ({ meta: [{ title: 'Video Tools | LunaShare' }] }),
  component: VideoToolPage,
});

function VideoToolPage() {
  return (
    <div className="h-full">
      <VideoEditorPage />
    </div>
  );
}
