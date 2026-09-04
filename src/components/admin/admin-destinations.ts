import { Activity, FileImage, Gauge, MapIcon, ShieldAlert, Sparkles, User2, Variable, Zap } from 'lucide-react';

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
    name: 'Templates',
    to: '/admin/templates',
    Icon: FileImage,
    description: 'Manage image generation templates',
  },
  {
    name: 'Global Variables',
    to: '/admin/global-variables',
    Icon: Variable,
    description: 'Shared variables used across templates',
  },
  {
    name: 'Models',
    to: '/admin/models',
    Icon: Sparkles,
    description: 'Configure AI generation models',
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
