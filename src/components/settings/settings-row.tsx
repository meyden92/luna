import type * as React from 'react';
import { cn } from '@/libs/utils';
import styles from './settings-row.module.css';

interface SettingsRowProps extends React.ComponentProps<'div'> {
  label: React.ReactNode;
  hint?: React.ReactNode;
}

/**
 * One row inside a Settings panel: a 220px label column and the control.
 * Consecutive rows grow a 1px divider between them (see `& + &` below); the
 * panel's border and header already close the top and bottom.
 */
export function SettingsRow({ label, hint, className, children, ...props }: SettingsRowProps) {
  return (
    <div
      className={cn(styles.root, className)}
      {...props}
    >
      <div className={styles.label}>
        <span className={styles.labelText}>{label}</span>
        {hint && <span className={styles.hint}>{hint}</span>}
      </div>
      <div className={styles.control}>{children}</div>
    </div>
  );
}
