import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import AdminNav from '@/components/admin/AdminNav';
import AdminBreadcrumbsWrapper from '@/components/admin/admin-breadcrumbs-wrapper';
import { queryKeys } from '@/libs/query-keys';
import { checkCurrentUserIsAdmin } from '@/server/fns/rbac';
import styles from './_admin.module.css';

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
    <div className={styles.root}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <h1 className="type-2xl weight-bold">Admin Panel</h1>
        </div>
        <AdminNav />
      </aside>
      <div className={styles.content}>
        <div className={styles.breadcrumbs}>
          <AdminBreadcrumbsWrapper />
        </div>
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
