import { createFileRoute, Outlet } from '@tanstack/react-router';
import Footer from '@/components/landing/Footer';
import styles from './_bin.module.css';

export const Route = createFileRoute('/_dashboard/_bin')({
  component: BinLayout,
});

function BinLayout() {
  return (
    <div className={styles.root}>
      <div className={styles.body}>
        <Outlet />
      </div>
      <Footer />
    </div>
  );
}
