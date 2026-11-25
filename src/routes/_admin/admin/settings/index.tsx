import { createFileRoute } from '@tanstack/react-router';
import { settingsSections } from '@/components/admin/admin-destinations';
import { DestinationTiles } from '@/components/admin/destination-tiles';
import styles from '../index.module.css';

export const Route = createFileRoute('/_admin/admin/settings/')({
  head: () => ({ meta: [{ title: 'Settings | LunaShare' }] }),
  component: SettingsIndexPage,
});

function SettingsIndexPage() {
  return (
    <div>
      <h1 className={styles.title}>Settings</h1>
      <DestinationTiles destinations={settingsSections} />
    </div>
  );
}
