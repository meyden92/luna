import { createFileRoute, Outlet } from '@tanstack/react-router';
import Footer from '@/components/landing/Footer';
import styles from './_privacy.module.css';

export const Route = createFileRoute('/_privacy')({
  component: PrivacyLayout,
});

function PrivacyLayout() {
  return (
    <main className={styles.root}>
      <div className={styles.panel}>
        <Outlet />
      </div>
      <Footer />
    </main>
  );
}
