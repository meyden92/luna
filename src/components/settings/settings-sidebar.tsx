import { Link, useLocation } from '@tanstack/react-router';
import { BarChart, Key, Settings, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/libs/utils';
import styles from './settings-sidebar.module.css';

export function SettingsSidebar({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  const pathname = useLocation().pathname;

  const sidebarNavItems = [
    {
      title: 'General',
      href: '/settings',
      icon: Settings,
    },
    {
      title: 'API',
      href: '/settings/api',
      icon: Key,
    },
    {
      title: 'Account',
      href: '/settings/account',
      icon: User,
    },
    {
      title: 'Usage',
      href: '/settings/usage',
      icon: BarChart,
    },
  ];

  return (
    <nav
      className={cn(styles.root, className)}
      {...props}
    >
      {sidebarNavItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Button
            key={item.href}
            variant="ghost"
            className={styles.item}
            data-active={isActive || undefined}
            render={<Link to={item.href} />}
          >
            <item.icon className={styles.icon} />
            {item.title}
          </Button>
        );
      })}
    </nav>
  );
}
