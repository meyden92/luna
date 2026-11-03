import { Activity, Gauge, Globe, MapIcon, ShieldAlert, User2, Zap } from 'lucide-react';

export const adminDestinations = [
  {
    name: 'Users',
    to: '/admin/users',
    Icon: User2,
    description: 'Manage all users of the platform',
  },
  {
    name: 'Tasks',
    to: '/admin/tasks',
    Icon: Zap,
    description: 'Track, assign, and complete tasks',
  },
  {
    name: 'Sources',
    to: '/admin/sources',
    Icon: Globe,
    description: 'Source sessions and the yt-dlp version behind the Downloader',
  },
  {
    name: 'Audits',
    to: '/admin/audit',
    Icon: MapIcon,
    description: 'Review audit logs and system events',
  },
  {
    name: 'Trust',
    to: '/admin/moderation',
    Icon: ShieldAlert,
    description: 'Review quarantined uploads and denylisted hashes',
  },
  {
    name: 'Egress',
    to: '/admin/egress',
    Icon: Gauge,
    description: 'Inspect delivery bandwidth consumers',
  },
  {
    name: 'Activity',
    to: '/admin/tasks/logs',
    Icon: Activity,
    description: 'Inspect recent task execution history',
  },
] as const;
