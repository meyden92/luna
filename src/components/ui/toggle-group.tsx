import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group';
import * as React from 'react';
import type { ToggleSize, ToggleVariant } from '@/components/ui/toggle';
import { cn } from '@/libs/utils';
import toggleStyles from './toggle.module.css';
import styles from './toggle-group.module.css';

type ToggleGroupOptions = {
  variant?: ToggleVariant;
  size?: ToggleSize;
  spacing?: number;
  orientation?: 'horizontal' | 'vertical';
};

const ToggleGroupContext = React.createContext<ToggleGroupOptions>({
  size: 'default',
  variant: 'default',
  spacing: 0,
  orientation: 'horizontal',
});

function ToggleGroup({
  className,
  variant,
  size,
  spacing = 0,
  orientation = 'horizontal',
  children,
  ...props
}: ToggleGroupPrimitive.Props & ToggleGroupOptions) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      data-orientation={orientation}
      style={{ '--gap': spacing } as React.CSSProperties}
      className={cn(styles.root, className)}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size, spacing, orientation }}>{children}</ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  );
}

function ToggleGroupItem({
  className,
  children,
  variant = 'default',
  size = 'default',
  ...props
}: TogglePrimitive.Props & Pick<ToggleGroupOptions, 'variant' | 'size'>) {
  const context = React.useContext(ToggleGroupContext);

  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      data-spacing={context.spacing}
      className={cn(toggleStyles.root, styles.item, className)}
      {...props}
    >
      {children}
    </TogglePrimitive>
  );
}

export { ToggleGroup, ToggleGroupItem };
