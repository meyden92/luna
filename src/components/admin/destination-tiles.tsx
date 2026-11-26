import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, type LinkProps } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import { studioStatusQueryOptions } from '@/components/studio/studio-status';
import styles from './destination-tiles.module.css';

type Destination = { name: string; to: LinkProps['to']; Icon: LucideIcon; description: string; studio?: boolean; stat?: string };

export function DestinationTiles({ destinations }: { destinations: readonly Destination[] }) {
  const { data: studio } = useSuspenseQuery(studioStatusQueryOptions);
  return (
    <div className={styles.grid}>
      {destinations
        .filter((entry) => !entry.studio || studio.enabled)
        .map(({ name, to, Icon, description, stat }) => (
          <Link
            key={name}
            to={to}
            className={styles.tile}
          >
            <Icon className={styles.icon} />
            <span className={styles.tileTitle}>{name}</span>
            <div>
              <p className={styles.description}>{description}</p>
              {stat && <p className={styles.stat}>{stat}</p>}
            </div>
          </Link>
        ))}
    </div>
  );
}
