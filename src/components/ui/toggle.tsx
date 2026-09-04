import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';

import { cn } from '@/libs/utils';
import styles from './toggle.module.css';

type ToggleVariant = 'default' | 'outline';
type ToggleSize = 'sm' | 'default' | 'lg';

function Toggle({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: TogglePrimitive.Props & {
  variant?: ToggleVariant;
  size?: ToggleSize;
}) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      data-variant={variant}
      data-size={size}
      className={cn(styles.root, className)}
      {...props}
    />
  );
}

export type { ToggleSize, ToggleVariant };
export { Toggle };
