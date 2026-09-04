import { createFileRoute } from '@tanstack/react-router';
import { AudioEditorPage } from '@/components/audio-editor/AudioEditorPage';
import styles from './audio.module.css';

export const Route = createFileRoute('/_dashboard/tools/audio')({
  head: () => ({ meta: [{ title: 'Audio Tools | LunaShare' }] }),
  component: AudioToolPage,
});

function AudioToolPage() {
  return (
    <div className={styles.root}>
      <AudioEditorPage />
    </div>
  );
}
