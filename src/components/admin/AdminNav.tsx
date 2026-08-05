import { Link, useLocation } from '@tanstack/react-router';
import { Home } from 'lucide-react';
import { adminDestinations } from '@/components/admin/admin-destinations';
import { cn } from '@/libs/utils';

const adminPaths = [
  { name: 'Home', to: '/admin', Icon: Home },
  ...adminDestinations.map(({ name, to, Icon }) => ({ name, to, Icon })),
] as const;

export default function AdminNav() {
  const path = useLocation().pathname;

  return (
    <nav className="space-y-1">
      {adminPaths.map((entry) => (
        <Link
          key={entry.name}
          to={entry.to}
          className={cn(
            'flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors',
            path === entry.to ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-primary',
          )}
        >
          <entry.Icon className="mr-3 h-5 w-5" />
          {entry.name}
        </Link>
      ))}
    </nav>
  );
}
