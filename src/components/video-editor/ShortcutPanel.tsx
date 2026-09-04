import { ChevronRightIcon, KeyboardIcon } from 'lucide-react';
import styles from './ShortcutPanel.module.css';

interface ShortcutPanelProps {
  open: boolean;
  onToggle: () => void;
  shortcuts?: Array<[string, string]>;
  title?: string;
}

const VIDEO_SHORTCUTS: Array<[string, string]> = [
  ['Space / K', 'Play · Pause'],
  ['J · L', 'Seek −5s · +5s'],
  ['← · →', 'Seek −1s · +1s'],
  ['Shift + ← · →', 'Seek −5s · +5s'],
  ['Home · End', 'Jump to trim start · end'],
  ['I · O', 'Set trim in · out'],
  ['C', 'Mark cut in · out'],
  ['1 · 2 · 3', 'Trim · Cut · Crop'],
  ['Ctrl + S', 'Save / Export'],
  ['?', 'Toggle this panel'],
];

export function ShortcutPanel({ open, onToggle, shortcuts = VIDEO_SHORTCUTS, title = 'Shortcuts' }: ShortcutPanelProps) {
  return (
    <div className={styles.root}>
      <div
        className={styles.panel}
        data-open={open}
      >
        <div className={styles.card}>
          <div className={styles.title}>
            <KeyboardIcon />
            {title}
          </div>
          <dl className={styles.list}>
            {shortcuts.map(([keys, label]) => (
              <div
                key={keys}
                className={styles.row}
              >
                <dt className={styles.keys}>{keys}</dt>
                <dd className={styles.label}>{label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? 'Hide shortcuts' : 'Show shortcuts'}
          className={styles.toggle}
        >
          <ChevronRightIcon />
        </button>
      </div>
    </div>
  );
}
