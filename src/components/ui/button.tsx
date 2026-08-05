import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/libs/utils';

const buttonVariants = cva(
  "focus-visible:border-ring/80 focus-visible:ring-ring/40 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 rounded-lg border bg-clip-padding text-sm font-medium focus-visible:ring-2 aria-invalid:ring-2 [&_svg:not([class*='size-'])]:size-4 inline-flex items-center justify-center whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-300 ease-out disabled:pointer-events-none disabled:opacity-50 hover:-translate-y-px active:translate-y-0 [&_svg]:pointer-events-none shrink-0 [&_svg]:shrink-0 outline-none group/button select-none",
  {
    variants: {
      variant: {
        default:
          'border-primary-700/35 bg-primary-500 text-primary-foreground shadow-sm hover:bg-primary-400 hover:border-primary-600/40 hover:shadow-md',
        outline:
          'border-border/80 bg-card text-foreground shadow-sm hover:border-primary/30 hover:bg-accent/70 hover:shadow-md aria-expanded:bg-muted aria-expanded:text-foreground',
        secondary:
          'border-border/60 bg-secondary text-secondary-foreground shadow-sm hover:bg-luna-bg-3 hover:shadow-md aria-expanded:bg-luna-bg-3 aria-expanded:text-secondary-foreground',
        ghost:
          'border-transparent text-foreground hover:border-border/60 hover:bg-accent/70 hover:text-foreground dark:hover:bg-muted/70 aria-expanded:bg-muted aria-expanded:text-foreground',
        destructive:
          'border-destructive/40 bg-destructive/15 text-destructive shadow-sm hover:bg-destructive/25 hover:shadow-md focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/20 focus-visible:border-destructive/40 dark:hover:bg-destructive/30',
        link: 'h-auto border-transparent bg-transparent p-0 text-primary shadow-none hover:translate-y-0 underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 gap-1.5 px-3.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
        xs: "h-6 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 gap-1 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        lg: 'h-10 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
        icon: 'size-9',
        'icon-xs': "size-6 [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
