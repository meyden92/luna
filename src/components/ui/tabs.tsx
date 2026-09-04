import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';

import { cn } from '@/libs/utils';

import styles from './tabs.module.css';

/** `default` is the pill list on a muted track; `line` is the underlined list. */
type TabsListVariant = 'default' | 'line';

function Tabs({ className, orientation = 'horizontal', ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(styles.root, className)}
      {...props}
    />
  );
}

function TabsList({ className, variant = 'default', ...props }: TabsPrimitive.List.Props & { variant?: TabsListVariant }) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(styles.list, className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(styles.trigger, className)}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn(styles.panel, className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
