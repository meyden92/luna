import { createFileRoute, Link } from '@tanstack/react-router';
import { adminDestinations } from '@/components/admin/admin-destinations';
import styles from './index.module.css';

export const Route = createFileRoute('/_admin/admin/')({
  head: () => ({ meta: [{ title: 'Admin | LunaShare' }] }),
  component: AdminIndexPage,
});

function AdminIndexPage() {
  return (
    <div>
      <h1 className={styles.title}>Admin</h1>
      <div className={styles.grid}>
        {adminDestinations.map(({ name, to, Icon, description }) => (
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
    </div>
  );
}
