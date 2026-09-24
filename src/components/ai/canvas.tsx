import type * as React from 'react';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { cn } from '@/libs/utils';
import styles from './canvas.module.css';

/** The column of runs below the prompt card. */
function Canvas({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="canvas"
      className={cn(styles.canvas, className)}
      {...props}
    />
  );
}

interface CanvasEmptyProps {
  title: string;
  description: React.ReactNode;
  /** Example prompt chips, or nothing when a tab has no useful examples. */
  children?: React.ReactNode;
}

/** The canvas before its first run: a tall recessed well, not a dashed box. */
function CanvasEmpty({ title, description, children }: CanvasEmptyProps) {
  return (
    <Empty className={styles.well}>
      <EmptyHeader>
        <EmptyTitle className={styles.title}>{title}</EmptyTitle>
        <EmptyDescription className={styles.description}>{description}</EmptyDescription>
      </EmptyHeader>
      {children && <EmptyContent className={styles.ideas}>{children}</EmptyContent>}
    </Empty>
  );
}

/** An example prompt. Clicking one fills the prompt card with it. */
function IdeaChip({ className, ...props }: React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(styles.idea, className)}
      {...props}
    />
  );
}

export { Canvas, CanvasEmpty, IdeaChip };
