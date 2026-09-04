import { queryOptions } from '@tanstack/react-query';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { SettingsSidebar } from '@/components/settings/settings-sidebar';
import { Separator } from '@/components/ui/separator';
import { queryKeys } from '@/libs/query-keys';
import { cn } from '@/libs/utils';
import { getSettingsOverview } from '@/server/fns/dashboard/settings-overview';
import styles from './_settings.module.css';

export const settingsOverviewQuery = queryOptions({
  queryKey: queryKeys.dashboard.settingsOverview,
  queryFn: () => getSettingsOverview(),
});

export const Route = createFileRoute('/_dashboard/_settings')({
  loader: ({ context }) => context.queryClient.ensureQueryData(settingsOverviewQuery),
  component: SettingsLayout,
});

function SettingsLayout() {
  return (
    <div className={cn('stack space-6', styles.root)}>
      <div className="stack space-1">
        <h2 className={cn('type-2xl weight-bold', styles.title)}>Settings</h2>
        <p className={styles.subtitle}>Manage your account settings and set e-mail preferences.</p>
      </div>
      <Separator />
      <div className={styles.panels}>
        <aside className={styles.nav}>
          <SettingsSidebar />
        </aside>
        <div className={styles.pane}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
