import { queryOptions } from '@tanstack/react-query';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { SettingsSidebar } from '@/components/settings/settings-sidebar';
import { queryKeys } from '@/libs/query-keys';
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
    <div className={styles.root}>
      <SettingsSidebar />
      <div className={styles.content}>
        <Outlet />
      </div>
    </div>
  );
}
