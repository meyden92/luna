import type * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/libs/utils';

import styles from './input-group.module.css';

/** Where an addon sits relative to the control: beside it, or stacked above/below. */
type InputGroupAddonAlign = 'inline-start' | 'inline-end' | 'block-start' | 'block-end';

/** Compact button sizes that fit inside the group's control height. */
type InputGroupButtonSize = 'xs' | 'sm' | 'icon-xs' | 'icon-sm';

function InputGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(styles.root, className)}
      {...props}
    />
  );
}

function InputGroupAddon({ className, align = 'inline-start', ...props }: React.ComponentProps<'div'> & { align?: InputGroupAddonAlign }) {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={cn(styles.addon, className)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) {
          return;
        }
        e.currentTarget.parentElement?.querySelector('input')?.focus();
      }}
      {...props}
    />
  );
}

function InputGroupButton({
  className,
  type = 'button',
  variant = 'ghost',
  size = 'xs',
  ...props
}: Omit<React.ComponentProps<typeof Button>, 'size' | 'type'> & {
  size?: InputGroupButtonSize;
  type?: 'button' | 'submit' | 'reset';
}) {
  return (
    <Button
      type={type}
      data-size={size}
      variant={variant}
      className={cn(styles.button, className)}
      {...props}
    />
  );
}

function InputGroupText({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(styles.text, className)}
      {...props}
    />
  );
}

function InputGroupInput({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <Input
      data-slot="input-group-control"
      className={cn(styles.control, className)}
      {...props}
    />
  );
}

function InputGroupTextarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <Textarea
      data-slot="input-group-control"
      className={cn(styles.control, styles.textarea, className)}
      {...props}
    />
  );
}

export { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText, InputGroupTextarea };
