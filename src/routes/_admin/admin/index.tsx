import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { adminDestinations } from '@/components/admin/admin-destinations';
import { VersionCard } from '@/components/admin/version/version-card';
import { studioStatusQueryOptions } from '@/components/studio/studio-status';
import styles from './index.module.css';

export const Route = createFileRoute('/_admin/admin/')({
  head: () => ({ meta: [{ title: 'Admin | LunaShare' }] }),
  component: AdminIndexPage,
});

function AdminIndexPage() {
  const { data: studio } = useSuspenseQuery(studioStatusQueryOptions);
  return (
    <div>
      <h1 className={styles.title}>Admin</h1>
      <div className={styles.grid}>
        {adminDestinations
          .filter((entry) => !('studio' in entry) || studio.enabled)
          .map(({ name, to, Icon, description }) => (
            <Link
              key={name}
              to={to}
              className={styles.tile}
            >
              <Icon className={styles.icon} />
              <span className={styles.tileTitle}>{name}</span>
              <p className={styles.description}>{description}</p>
            </Link>
          ))}
      </div>
      <VersionCard />
    </div>
  );
}
