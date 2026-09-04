import { createFileRoute, Link } from '@tanstack/react-router';
import { Home, Search } from 'lucide-react';
import { useMemo } from 'react';
import Footer from '@/components/landing/Footer';
import { Button } from '@/components/ui/button';
import styles from './$.module.css';

const NOT_FOUND_MESSAGES = [
  'Oops! This page has gone to get coffee and never came back.',
  "404: Page playing hide and seek since 2023. (It's winning.)",
  'Houston, we have a problem. This page has gone to space.',
  'Looks like this page took a vacation without telling anyone.',
  'This page is hanging out with Bigfoot and the Loch Ness Monster.',
  'Error 404: Page not found. Maybe try looking under the couch?',
  "This link is as broken as my New Year's resolutions.",
  'The page you requested is social distancing right now.',
  'Plot twist: This page never existed!',
  'This page was last seen with my lost socks from the dryer.',
];

export const Route = createFileRoute('/$')({
  head: () => ({ meta: [{ title: '404 - Page Not Found | LunaShare' }] }),
  component: NotFoundPage,
});

function NotFoundPage() {
  const randomMessage = useMemo(() => NOT_FOUND_MESSAGES[Math.floor(Math.random() * NOT_FOUND_MESSAGES.length)], []);

  return (
    <div className={styles.root}>
      <div className={styles.body}>
        <div className={styles.emblem}>
          <div className={styles.glyph}>
            <Search size={80} />
          </div>
          <div className={styles.haloLayer}>
            <div className={styles.halo} />
          </div>
        </div>

        <div className={styles.content}>
          <h1 className={`${styles.title} type-4xl weight-bold`}>404 - Page Not Found</h1>

          <div className={styles.card}>
            <div className={styles.inner}>
              <div className={styles.message}>
                <div className={styles.messageIcon}>
                  <Search />
                </div>
                <p className={styles.messageText}>{randomMessage}</p>
              </div>

              <div className={styles.actions}>
                <Link to="/">
                  <Button variant="secondary">
                    <Home size={18} />
                    Back to Home
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          <p className={`${styles.footnote} type-sm`}>Feel free to try another page, or click above to return home.</p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
