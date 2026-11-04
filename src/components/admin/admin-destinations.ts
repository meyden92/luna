import {
  Activity,
  BarChart3,
  Gauge,
  Globe,
  LayoutTemplate,
  MapIcon,
  Settings2,
  Shapes,
  ShieldAlert,
  Sparkles,
  User2,
  Zap,
} from 'lucide-react';

/** `studio` entries show only while the Studio is enabled. */

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
  {
    name: 'Studio categories',
    to: '/admin/studio/categories',
    Icon: Shapes,
    description: 'Define the tasks Users start from in the Studio',
    studio: true,
  },
  {
    name: 'Studio models',
    to: '/admin/studio/models',
    Icon: Sparkles,
    description: 'Add fal Models and choose which inputs Users see',
    studio: true,
  },
  {
    name: 'Studio templates',
    to: '/admin/studio/templates',
    Icon: LayoutTemplate,
    description: 'Write prompts with Variables Users fill in',
    studio: true,
  },
  {
    name: 'Studio overview',
    to: '/admin/studio/overview',
    Icon: BarChart3,
    description: 'Spend, Budgets, failures and running Generations',
    studio: true,
  },
  {
    name: 'Studio settings',
    to: '/admin/studio/settings',
    Icon: Settings2,
    description: 'The default monthly Budget and the active Generation limit',
    studio: true,
  },
] as const;
