import { createFileRoute, Outlet } from '@tanstack/react-router';
import Footer from '@/components/landing/Footer';
import styles from './_profile.module.css';

export const Route = createFileRoute('/_dashboard/_profile')({
  component: ProfileLayout,
});

function ProfileLayout() {
  return (
    <div className={styles.root}>
      <div className={styles.body}>
        <Outlet />
      </div>
      <Footer />
    </div>
  );
}
