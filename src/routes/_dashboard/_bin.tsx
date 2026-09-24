import { createFileRoute, Outlet } from '@tanstack/react-router';
import styles from './_bin.module.css';

export const Route = createFileRoute('/_dashboard/_bin')({
  component: BinLayout,
});

function BinLayout() {
  return (
    <div className={styles.root}>
      <Outlet />
    </div>
  );
}
