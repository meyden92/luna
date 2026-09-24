import type * as React from 'react';
import { cn } from '@/libs/utils';
import styles from './settings-panel.module.css';

/** The bordered card every Settings panel sits in: a 1px border, radius-xl and `--card`. */
export function SettingsPanel({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(styles.root, className)}
      {...props}
    />
  );
}

interface SettingsPanelHeaderProps extends React.ComponentProps<'div'> {
  title: string;
  description?: React.ReactNode;
  /** A logo or icon in the leading slot, e.g. the ShareX mark. */
  icon?: React.ReactNode;
  /** A button pinned to the trailing edge, e.g. "+ New token". */
  action?: React.ReactNode;
}

/** h3 title + description, with an optional leading icon and trailing action. */
export function SettingsPanelHeader({ title, description, icon, action, className, ...props }: SettingsPanelHeaderProps) {
  return (
    <div
      className={cn(styles.header, className)}
      {...props}
    >
      {icon}
      <div className={styles.headerText}>
        <h3 className={styles.headerTitle}>{title}</h3>
        {description && <p className={styles.headerDescription}>{description}</p>}
      </div>
      {action && <div className={styles.headerAction}>{action}</div>}
    </div>
  );
}
