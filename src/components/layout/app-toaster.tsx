import { Check, CircleAlert, Info, TriangleAlert } from 'lucide-react';
import { Toaster as SonnerToaster } from 'sonner';
import { Spinner } from '@/components/ui/spinner';
import styles from './app-toaster.module.css';

/**
 * The app's toast surface: top centre and clear of the nav, in the same
 * bordered popover style as a menu, and short-lived — a toast reports what
 * already happened ("Link copied"), so it does not need reading time.
 *
 * Sonner is unstyled here so the whole look comes from the co-located module
 * (ADR 0003); Sonner keeps only the stacking and the timers.
 */
function AppToaster() {
  return (
    <SonnerToaster
      position="top-center"
      offset="calc(var(--nav-height) + 12px)"
      duration={2200}
      icons={{
        success: <Check aria-hidden />,
        error: <CircleAlert aria-hidden />,
        warning: <TriangleAlert aria-hidden />,
        info: <Info aria-hidden />,
        loading: <Spinner />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: styles.toast,
          title: styles.title,
          description: styles.description,
          icon: styles.icon,
          error: styles.error,
          actionButton: styles.actionButton,
          cancelButton: styles.cancelButton,
          closeButton: styles.closeButton,
        },
      }}
    />
  );
}

export { AppToaster };
