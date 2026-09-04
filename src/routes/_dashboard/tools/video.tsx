import { createFileRoute } from '@tanstack/react-router';
import { VideoEditorPage } from '@/components/video-editor/VideoEditorPage';
import styles from './video.module.css';

export const Route = createFileRoute('/_dashboard/tools/video')({
  head: () => ({ meta: [{ title: 'Video Tools | LunaShare' }] }),
  component: VideoToolPage,
});

function VideoToolPage() {
  return (
    <div className={styles.root}>
      <VideoEditorPage />
    </div>
  );
}
