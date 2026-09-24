import { Link } from '@tanstack/react-router';
import { ArrowRight, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import type React from 'react';
import { useEffect, useState } from 'react';
import { cn } from '@/libs/utils';
import styles from './Navigation.module.css';

/**
 * The marketing site's nav bar: a visitor's only chrome.
 *
 * The signed-in app has its own bar (`src/components/layout/AppNav.tsx`) with a
 * different height, a different type scale and the Upload action, so the two are
 * separate components rather than one component with two modes. `AppShell`
 * chooses between them.
 */
export default function Navigation({ className, ...props }: React.ComponentProps<'nav'>) {
  const { resolvedTheme, setTheme } = useTheme();

  // The resolved Appearance is unknown until next-themes has read the document,
  // so the icon holds still until then rather than flipping after hydration.
  const [appearanceReady, setAppearanceReady] = useState(false);
  useEffect(() => setAppearanceReady(true), []);
  const isDark = resolvedTheme === 'dark';

  return (
    <nav
      className={cn(styles.root, className)}
      {...props}
    >
      <div className={styles.bar}>
        <Link
          to="/"
          aria-label="LunaShare home"
          className={styles.brand}
        >
          <img
            src="/lunashare-logo.png"
            alt="LunaShare"
            width={139}
            height={34}
            className={cn(styles.logo, styles.logoLight)}
          />
          <img
            src="/lunashare-logo-dark.png"
            alt="LunaShare"
            width={139}
            height={34}
            className={cn(styles.logo, styles.logoDark)}
          />
        </Link>

        <div className={styles.actions}>
          <button
            type="button"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            aria-label={appearanceReady ? (isDark ? 'Switch to light appearance' : 'Switch to dark appearance') : 'Toggle appearance'}
            className={styles.iconButton}
          >
            {appearanceReady && !isDark ? <Moon size={15} /> : <Sun size={15} />}
          </button>

          <Link
            to="/login"
            className={styles.signIn}
          >
            Login
          </Link>
          <Link
            to="/dashboard"
            className={styles.openApp}
          >
            Open app <ArrowRight className={styles.openAppIcon} />
          </Link>
        </div>
      </div>
    </nav>
  );
}
