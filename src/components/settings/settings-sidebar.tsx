import { Link, useLocation } from '@tanstack/react-router';
import { HardDrive, Upload, User2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/libs/utils';
import styles from './settings-sidebar.module.css';

const SECTIONS = [
  { href: '/settings/profile', label: 'Profile', icon: User2 },
  { href: '/settings', label: 'Uploads & ShareX', icon: Upload },
  { href: '/settings/storage', label: 'Storage', icon: HardDrive },
] as const;

/** The 200px sticky sub-nav: the "Settings" title plus the three sections. */
export function SettingsSidebar({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  const pathname = useLocation().pathname;

  return (
    <nav
      className={cn(styles.root, className)}
      {...props}
    >
      <h1 className={styles.title}>Settings</h1>
      {SECTIONS.map((section) => {
        const isActive = pathname === section.href;
        return (
          <Button
            key={section.href}
            variant="ghost"
            className={styles.item}
            data-active={isActive || undefined}
            render={<Link to={section.href} />}
          >
            <section.icon className={styles.icon} />
            {section.label}
          </Button>
        );
      })}
    </nav>
  );
}
