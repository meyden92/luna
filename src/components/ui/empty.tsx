import { cn } from '@/libs/utils';

import styles from './empty.module.css';

function Empty({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty"
      className={cn(styles.root, className)}
      {...props}
    />
  );
}

function EmptyHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty-header"
      className={cn(styles.header, className)}
      {...props}
    />
  );
}

/** `variant="icon"` renders the child glyph inside a recessed rounded tile. */
function EmptyMedia({ className, variant = 'default', ...props }: React.ComponentProps<'div'> & { variant?: 'default' | 'icon' }) {
  return (
    <div
      data-slot="empty-icon"
      data-variant={variant}
      className={cn(styles.media, className)}
      {...props}
    />
  );
}

function EmptyTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty-title"
      className={cn(styles.title, className)}
      {...props}
    />
  );
}

function EmptyDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <div
      data-slot="empty-description"
      className={cn(styles.description, className)}
      {...props}
    />
  );
}

function EmptyContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty-content"
      className={cn(styles.content, className)}
      {...props}
    />
  );
}

export { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle };
