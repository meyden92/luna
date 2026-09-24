import type * as React from 'react';
import { cn } from '@/libs/utils';
import styles from './settings-section.module.css';

interface SettingsSectionProps extends React.ComponentProps<'section'> {
  title: string;
  description: string;
}

/**
 * The header + panel stack shared by all three Settings sections (Profile,
 * Uploads & ShareX, Storage): an h2 title, a muted description, and whatever
 * panels the caller passes as children.
 */
export function SettingsSection({ title, description, className, children, ...props }: SettingsSectionProps) {
  return (
    <section
      className={cn(styles.root, className)}
      {...props}
    >
      <header className={styles.head}>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.description}>{description}</p>
      </header>
      <div className={styles.panels}>{children}</div>
    </section>
  );
}
