import { useQuery } from '@tanstack/react-query';
import { formatSize } from '@/libs/utils';
import { getStorageUsage } from '@/server/fns/storage';
import { SettingsPanel } from './settings-panel';
import styles from './storage-usage-panel.module.css';

type Category = 'image' | 'video' | 'audio' | 'other';

const CATEGORY_LABEL: Record<Category, string> = {
  image: 'Images',
  video: 'Video',
  audio: 'Audio',
  other: 'Other',
};

const CATEGORY_COLOR: Record<Category, string> = {
  image: 'var(--primary)',
  video: 'var(--folder-blue)',
  audio: 'var(--folder-violet)',
  other: 'var(--folder-orange)',
};

const CATEGORIES: Category[] = ['image', 'video', 'audio', 'other'];

/** The big number, the stacked bar and its legend — one grouped-aggregate query, exact. */
export function StorageUsagePanel() {
  const { data } = useQuery({
    queryKey: ['settings', 'storage', 'usage'],
    queryFn: () => getStorageUsage(),
  });

  const quotaBytes = data?.quotaBytes ?? 0;
  const usedBytes = data?.totalBytes ?? 0;
  const byKind = data?.byKind;

  return (
    <SettingsPanel>
      <div className={styles.body}>
        <div className={styles.big}>
          <span className={styles.bigValue}>{formatSize(usedBytes, { trim: true })}</span>
          <span className={styles.bigLabel}>of {formatSize(quotaBytes, { trim: true })} used</span>
        </div>
        <div className={styles.stack}>
          {CATEGORIES.map((category) => (
            <span
              key={category}
              className={styles.segment}
              style={{
                width: quotaBytes > 0 ? `${Math.min(((byKind?.[category] ?? 0) / quotaBytes) * 100, 100)}%` : 0,
                background: CATEGORY_COLOR[category],
              }}
            />
          ))}
        </div>
        <div className={styles.legend}>
          {CATEGORIES.map((category) => (
            <span
              key={category}
              className={styles.legendItem}
            >
              <i
                className={styles.legendSwatch}
                style={{ background: CATEGORY_COLOR[category] }}
              />
              {CATEGORY_LABEL[category]}
              <span className={styles.legendSize}>{formatSize(byKind?.[category] ?? 0, { trim: true })}</span>
            </span>
          ))}
        </div>
      </div>
    </SettingsPanel>
  );
}
