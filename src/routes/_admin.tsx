import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import AdminNav from '@/components/admin/AdminNav';
import AdminBreadcrumbsWrapper from '@/components/admin/admin-breadcrumbs-wrapper';
import { queryKeys } from '@/libs/query-keys';
import { checkCurrentUserIsAdmin } from '@/server/fns/rbac';

export const Route = createFileRoute('/_admin')({
  beforeLoad: async ({ context }) => {
    if (!context.session?.user?.id) throw redirect({ to: '/login' });
    const allowed = await context.queryClient.ensureQueryData({
      queryKey: queryKeys.adminRbac.currentUserIsAdmin,
      queryFn: () => checkCurrentUserIsAdmin(),
      staleTime: 30_000,
    });
    if (!allowed) throw redirect({ to: '/unauthorized' });
  },
  head: () => ({ meta: [{ title: 'Admin Panel | LunaShare' }, { name: 'description', content: 'Private Filesharing' }] }),
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <div className="flex bg-background min-h-full max-w-full overflow-x-hidden">
      <aside className="w-64 bg-muted/30 p-4 border-r border-border shrink-0">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-primary mt-6">Admin Panel</h1>
        </div>
        <AdminNav />
      </aside>
      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-x-hidden">
        <div className="p-8 pb-4">
          <AdminBreadcrumbsWrapper />
        </div>
        <main className="flex-1 px-8 pb-8 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
