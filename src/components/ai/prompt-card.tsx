import type * as React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/libs/utils';
import styles from './prompt-card.module.css';

/**
 * The raised card that holds a prompt and the controls that run it. Create and
 * Edit share it: Create fills the slots with model/shape/count, Edit adds a row
 * of reference slots above the textarea and swaps the action button.
 *
 * Composed rather than configured, because the only thing the two tabs share is
 * the surface and its focus treatment.
 */
function PromptCard({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="prompt-card"
      className={cn(styles.card, className)}
      {...props}
    />
  );
}

/** Row of reference image slots, above the textarea. */
function PromptCardSlots({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(styles.slots, className)}
      {...props}
    />
  );
}

/**
 * The prompt itself: borderless inside the card, auto-growing, 17px. `compact`
 * is for Edit, where the reference slots already fill the card's top half.
 */
function PromptCardInput({ className, compact, ...props }: React.ComponentProps<'textarea'> & { compact?: boolean }) {
  return (
    <Textarea
      data-compact={compact || undefined}
      className={cn(styles.input, className)}
      {...props}
    />
  );
}

/** Control bar along the bottom of the card. */
function PromptCardBar({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(styles.bar, className)}
      {...props}
    />
  );
}

/** Trailing group of the bar: the keyboard hint or disabled reason, then the action. */
function PromptCardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(styles.action, className)}
      {...props}
    />
  );
}

/** "⌘ ↵", or the sentence explaining why the action is disabled. */
function PromptCardHint({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(styles.hint, className)}
      {...props}
    />
  );
}

export { PromptCard, PromptCardAction, PromptCardBar, PromptCardHint, PromptCardInput, PromptCardSlots };
