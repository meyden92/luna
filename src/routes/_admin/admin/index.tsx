import { createFileRoute, Link } from '@tanstack/react-router';
import { adminDestinations } from '@/components/admin/admin-destinations';
import { cn } from '@/libs/utils';
import styles from './index.module.css';

export const Route = createFileRoute('/_admin/admin/')({
  head: () => ({ meta: [{ title: 'Admin | LunaShare' }] }),
  component: AdminIndexPage,
});

const CHART_TONES = 5;

function AdminIndexPage() {
  return (
    <div>
      <h1 className="type-2xl weight-bold margin-bottom-4">Admin</h1>
      <div className={styles.grid}>
        {adminDestinations.map(({ name, to, Icon, description }, index) => (
          <Link
            key={name}
            to={to}
            className={styles.tile}
            data-tone={(index % CHART_TONES) + 1}
          >
            <Icon className={styles.icon} />
            <span className="type-lg weight-semibold">{name}</span>
            <p className={cn(styles.description, 'type-sm margin-top-2')}>{description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
