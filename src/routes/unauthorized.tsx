import { createFileRoute, Link } from '@tanstack/react-router';
import { AlertTriangle, Lock, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import styles from './unauthorized.module.css';

export const Route = createFileRoute('/unauthorized')({
  head: () => ({ meta: [{ title: 'Unauthorized | LunaShare' }] }),
  component: UnauthorizedPage,
});

function UnauthorizedPage() {
  return (
    <main className={styles.root}>
      <div className={styles.emblem}>
        <div className={styles.glyph}>
          <Lock size={80} />
        </div>
        <div className={styles.haloLayer}>
          <div className={styles.halo} />
        </div>
      </div>

      <div className={styles.content}>
        <h1 className={`${styles.title} type-4xl weight-bold`}>Unauthorized</h1>

        <div className={styles.card}>
          <div className={styles.inner}>
            <div className={styles.message}>
              <div className={styles.messageIcon}>
                <AlertTriangle />
              </div>
              <p className={styles.messageText}>You do not have permission to access this page.</p>
            </div>

            <div className={styles.actions}>
              <Link to="/login">
                <Button className={styles.action}>
                  <Shield size={18} />
                  Go to Login
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <p className={`${styles.footnote} type-sm`}>©{new Date().getFullYear()} LunaShare. All rights reserved.</p>
      </div>
    </main>
  );
}
