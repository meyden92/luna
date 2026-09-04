import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/libs/utils';

import styles from './stat-card.module.css';

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: LucideIcon;
  /** Merged onto the icon; use it to recolour a stat that needs to stand out. */
  iconClassName?: string;
  /** Merged onto the value; use it to recolour a stat that needs to stand out. */
  valueClassName?: string;
}

export default function StatCard({ title, value, description, icon: Icon, iconClassName, valueClassName }: StatCardProps) {
  return (
    <Card className={styles.root}>
      <CardHeader className={styles.header}>
        <CardTitle className={styles.title}>{title}</CardTitle>
        {Icon && <Icon className={cn(styles.icon, iconClassName)} />}
      </CardHeader>
      <CardContent>
        <div className={cn(styles.value, valueClassName)}>{value}</div>
        {description && <p className={styles.description}>{description}</p>}
      </CardContent>
    </Card>
  );
}
