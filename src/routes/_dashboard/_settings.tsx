import { queryOptions } from '@tanstack/react-query';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { SettingsSidebar } from '@/components/settings/settings-sidebar';
import { Separator } from '@/components/ui/separator';
import { queryKeys } from '@/libs/query-keys';
import { getSettingsOverview } from '@/server/fns/dashboard/settings-overview';

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
    <div className="space-y-6 p-4 pb-10 sm:p-6 md:p-10 md:pb-16">
      <div className="space-y-0.5">
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">Manage your account settings and set e-mail preferences.</p>
      </div>
      <Separator className="my-6" />
      <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
        <aside className="-mx-1 overflow-x-auto pb-1 lg:mx-0 lg:w-1/5 lg:overflow-visible">
          <SettingsSidebar />
        </aside>
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
