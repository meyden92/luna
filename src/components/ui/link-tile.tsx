import { Link } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from './card';

import styles from './link-tile.module.css';

interface LinkTileProps {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

function LinkTile({ href, title, description, icon: Icon }: LinkTileProps) {
  return (
    <Link
      to={href}
      className={styles.link}
    >
      <Card className={styles.card}>
        <CardHeader>
          <CardTitle className={styles.title}>
            <Icon className={styles.icon} />
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}

export default LinkTile;
