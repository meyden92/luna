import { Link, useLocation } from '@tanstack/react-router';
import type { FileRouteTypes } from '@/routeTree.gen';
import styles from './admin-breadcrumbs-wrapper.module.css';

type AdminRouteTo = Extract<FileRouteTypes['to'], '/admin' | `/admin/${string}`>;
type Breadcrumb = {
  name: string;
  path: string;
  isLast: boolean;
  to?: AdminRouteTo;
};

const ADMIN_BREADCRUMB_LINKS = {
  '/admin': '/admin',
  '/admin/audit': '/admin/audit',
  '/admin/global-variables': '/admin/global-variables',
  '/admin/global-variables/new': '/admin/global-variables/new',
  '/admin/models': '/admin/models',
  '/admin/models/editing/new': '/admin/models/editing/new',
  '/admin/models/generation/new': '/admin/models/generation/new',
  '/admin/tasks': '/admin/tasks',
  '/admin/tasks/delete-cache': '/admin/tasks/delete-cache',
  '/admin/tasks/deleted-files': '/admin/tasks/deleted-files',
  '/admin/tasks/logs': '/admin/tasks/logs',
  '/admin/tasks/sync-files': '/admin/tasks/sync-files',
  '/admin/tasks/test-upload': '/admin/tasks/test-upload',
  '/admin/templates': '/admin/templates',
  '/admin/templates/create': '/admin/templates/create',
  '/admin/users': '/admin/users',
} as const satisfies Partial<Record<AdminRouteTo, AdminRouteTo>>;

const isAdminBreadcrumbPath = (path: string): path is keyof typeof ADMIN_BREADCRUMB_LINKS => Object.hasOwn(ADMIN_BREADCRUMB_LINKS, path);

export default function AdminBreadcrumbsWrapper() {
  const pathname = useLocation().pathname;

  // Helper function to convert URL segments to readable names
  const formatSegmentName = (segment: string) => {
    return segment
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Build breadcrumbs from pathname
  const buildBreadcrumbs = () => {
    const segments = pathname.split('/').filter(Boolean);
    const breadcrumbs: Breadcrumb[] = [];
    let currentPath = '';

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (!segment) continue;

      currentPath += `/${segment}`;

      // Skip if this is the root or if we haven't reached admin yet
      if (i === 0 && segment !== 'admin') continue;

      const isLast = i === segments.length - 1;
      const name = segment === 'admin' ? 'Admin' : formatSegmentName(segment);

      breadcrumbs.push({
        name,
        path: currentPath,
        isLast,
        to: isAdminBreadcrumbPath(currentPath) ? ADMIN_BREADCRUMB_LINKS[currentPath] : undefined,
      });
    }

    return breadcrumbs;
  };

  const breadcrumbs = buildBreadcrumbs();

  // Don't show breadcrumbs if we're not in admin or only at /admin
  if (!pathname.startsWith('/admin') || breadcrumbs.length <= 1) {
    return null;
  }

  return (
    <nav className={styles.nav}>
      <ol className={styles.trail}>
        {breadcrumbs.map((breadcrumb, index) => (
          <li
            key={breadcrumb.path}
            className={styles.crumb}
          >
            {index > 0 && <span className={styles.separator}>/</span>}
            {breadcrumb.isLast || !breadcrumb.to ? (
              <span className={styles.current}>{breadcrumb.name}</span>
            ) : (
              <Link
                to={breadcrumb.to}
                className={styles.link}
              >
                {breadcrumb.name}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
