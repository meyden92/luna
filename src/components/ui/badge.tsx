import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/libs/utils';

const badgeVariants = cva(
  'h-6 gap-1 rounded-md border px-2.5 py-0.5 text-xs font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-200 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&>svg]:size-3! inline-flex items-center justify-center w-fit whitespace-nowrap shrink-0 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/35 focus-visible:ring-2 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive shadow-sm group/badge',
  {
    variants: {
      variant: {
        default: 'border-primary/35 bg-primary/15 text-primary-900 dark:text-primary-100 [a]:hover:bg-primary/25',
        secondary: 'border-secondary/35 bg-secondary/20 text-secondary-foreground [a]:hover:bg-secondary/30',
        destructive:
          'border-destructive/35 bg-destructive/10 [a]:hover:bg-destructive/20 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 text-destructive dark:bg-destructive/20',
        outline: 'border-border/80 text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground bg-card',
        ghost: 'border-transparent hover:border-border/70 hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({
  className,
  variant = 'default',
  render,
  ...props
}: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>(
      {
        className: cn(badgeVariants({ className, variant })),
      },
      props,
    ),
    render,
    state: {
      slot: 'badge',
      variant,
    },
  });
}

export { Badge, badgeVariants };
