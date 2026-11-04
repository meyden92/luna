import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, useLocation } from '@tanstack/react-router';
import { Home } from 'lucide-react';
import { adminDestinations } from '@/components/admin/admin-destinations';
import { studioStatusQueryOptions } from '@/components/studio/studio-status';
import styles from './AdminNav.module.css';

export default function AdminNav() {
  const path = useLocation().pathname;
  const { data: studio } = useSuspenseQuery(studioStatusQueryOptions);
  const adminPaths = [
    { name: 'Home', to: '/admin', Icon: Home },
    ...adminDestinations.filter((entry) => !('studio' in entry) || studio.enabled).map(({ name, to, Icon }) => ({ name, to, Icon })),
  ] as const;

  return (
    <nav className={styles.nav}>
      {adminPaths.map((entry) => (
        <Link
          key={entry.name}
          to={entry.to}
          className={styles.link}
          data-current={path === entry.to}
        >
          <entry.Icon className={styles.icon} />
          {entry.name}
        </Link>
      ))}
    </nav>
  );
}
