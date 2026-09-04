import { Link } from '@tanstack/react-router';
import { Code, Globe, Star } from 'lucide-react';
import { Brandmark } from './Brandmark';
import styles from './Footer.module.css';

const COLUMNS = [
  {
    heading: 'Product',
    items: [
      { label: 'Dashboard', to: '/dashboard' },
      { label: 'Generate', to: '/ai/generate' },
      { label: 'Snippets', to: '/bin' },
      { label: 'Tools', to: '/tools/audio' },
    ],
  },
  {
    heading: 'Developers',
    items: [
      { label: 'API', to: '/settings' },
      { label: 'ShareX', to: '/settings' },
    ],
  },
  {
    heading: 'Legal',
    items: [
      { label: 'Privacy', to: '/privacy' },
      { label: 'Terms', to: '/tos' },
    ],
  },
] as const;

export default function Footer() {
  return (
    <footer className={styles.root}>
      <div className={styles.inner}>
        <div className={styles.columns}>
          <div className={styles.about}>
            <div className={styles.brand}>
              <Brandmark />
              <div className={styles.wordmark}>
                Luna
                <br />
                Share
              </div>
            </div>
            <p className={styles.blurb}>Secure and seamless file sharing platform for teams and individuals.</p>
          </div>
          <div className={styles.linkGroups}>
            {COLUMNS.map((col) => (
              <div key={col.heading}>
                <h6 className={styles.heading}>{col.heading}</h6>
                <ul className={styles.list}>
                  {col.items.map((item) => (
                    <li key={item.to + item.label}>
                      <Link
                        to={item.to}
                        className={styles.link}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.colophon}>
          <div>©2025 LunaShare · All rights reserved.</div>
          <div className={styles.social}>
            <a
              href="mailto:contact@lunashare.app"
              aria-label="Contact"
              className={styles.link}
            >
              <Globe size={18} />
            </a>
            <a
              href="https://github.com/crysis992"
              aria-label="GitHub"
              className={styles.link}
            >
              <Code size={18} />
            </a>
            <Link
              to="/dashboard"
              aria-label="Dashboard"
              className={styles.link}
            >
              <Star size={18} />
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
