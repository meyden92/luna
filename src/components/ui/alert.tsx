import type * as React from 'react';

import { cn } from '@/libs/utils';
import styles from './alert.module.css';

type AlertVariant = 'default' | 'destructive';

function Alert({ className, variant = 'default', ...props }: React.ComponentProps<'div'> & { variant?: AlertVariant }) {
  return (
    <div
      data-slot="alert"
      data-variant={variant}
      role="alert"
      className={cn(styles.root, className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn(styles.title, className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn(styles.description, className)}
      {...props}
    />
  );
}

function AlertAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-action"
      className={cn(styles.action, className)}
      {...props}
    />
  );
}

export { Alert, AlertAction, AlertDescription, AlertTitle };
