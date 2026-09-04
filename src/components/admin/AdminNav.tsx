import { Link, useLocation } from '@tanstack/react-router';
import { Home } from 'lucide-react';
import { adminDestinations } from '@/components/admin/admin-destinations';
import styles from './AdminNav.module.css';

const adminPaths = [
  { name: 'Home', to: '/admin', Icon: Home },
  ...adminDestinations.map(({ name, to, Icon }) => ({ name, to, Icon })),
] as const;

export default function AdminNav() {
  const path = useLocation().pathname;

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
