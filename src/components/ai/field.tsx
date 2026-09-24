import type * as React from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/libs/utils';
import styles from './field.module.css';

/**
 * A labelled control with an optional explanation under it. Used by the
 * generation settings drawer and the template runner form, which are the two
 * places the Generate screen asks for a value rather than offering a choice
 * inline on the prompt bar.
 */
function Field({ className, row, ...props }: React.ComponentProps<'div'> & { row?: boolean }) {
  return (
    <div
      data-row={row || undefined}
      className={cn(styles.field, className)}
      {...props}
    />
  );
}

/** Names a real form control — pair it with the control's `id`. */
function FieldLabel({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    <Label
      className={cn(styles.label, className)}
      {...props}
    />
  );
}

/**
 * Names a composite control (a toggle group, a slider, a select) that carries
 * its own accessible name, so the caption must not be a `<label>`.
 */
function FieldName({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(styles.label, styles.name, className)}
      {...props}
    />
  );
}

/** Why this control matters, or what its extremes cost. */
function FieldHint({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      className={cn(styles.hint, className)}
      {...props}
    />
  );
}

/** The live value beside a slider's label. */
function FieldValue({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(styles.value, className)}
      {...props}
    />
  );
}

export { Field, FieldHint, FieldLabel, FieldName, FieldValue };
