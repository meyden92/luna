import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';

import { cn } from '@/libs/utils';
import styles from './badge.module.css';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link';

function Badge({ className, variant = 'default', render, ...props }: useRender.ComponentProps<'span'> & { variant?: BadgeVariant }) {
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>(
      // Cast: data attributes are only inferable on JSX, not on a props object.
      { 'data-variant': variant, className: cn(styles.root, className) } as React.ComponentProps<'span'>,
      props,
    ),
    render,
    state: {
      slot: 'badge',
      variant,
    },
  });
}

export { Badge };
