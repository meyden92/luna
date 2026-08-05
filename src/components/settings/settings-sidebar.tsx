import { Link, useLocation } from '@tanstack/react-router';
import { BarChart, Key, Settings, User } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/libs/utils';

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
      className={cn('flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1', className)}
      {...props}
    >
      {sidebarNavItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            to={item.href}
            className={cn(
              buttonVariants({ variant: 'ghost' }),
              isActive ? 'bg-muted hover:bg-muted' : 'hover:bg-transparent hover:underline',
              'justify-start',
            )}
          >
            <item.icon className="mr-2 h-4 w-4" />
            {item.title}
          </Link>
        );
      })}
    </nav>
  );
}
