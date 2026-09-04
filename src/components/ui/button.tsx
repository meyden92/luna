import { Button as ButtonPrimitive } from '@base-ui/react/button';

import { cn } from '@/libs/utils';
import styles from './button.module.css';

type ButtonVariant = 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link';
type ButtonSize = 'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg';

/** Size prop values whose module class cannot share their (dashed) name. */
const sizeClass: Record<ButtonSize, string | undefined> = {
  default: undefined,
  xs: styles.xs,
  sm: styles.sm,
  lg: styles.lg,
  icon: styles.icon,
  'icon-xs': styles.iconXs,
  'icon-sm': styles.iconSm,
  'icon-lg': styles.iconLg,
};

const variantClass: Record<ButtonVariant, string> = {
  default: styles.default,
  outline: styles.outline,
  secondary: styles.secondary,
  ghost: styles.ghost,
  destructive: styles.destructive,
  link: styles.link,
};

/**
 * Class list for an element that must look like a Button but is not one — a
 * router link, a dialog trigger. A real <Button> uses the data attributes
 * instead; the module answers to both.
 */
function buttonVariants({
  variant = 'default',
  size = 'default',
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(styles.root, variantClass[variant], sizeClass[size], className);
}

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(styles.root, className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
