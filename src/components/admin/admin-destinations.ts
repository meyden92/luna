import {
  Activity,
  BarChart3,
  FolderX,
  Gauge,
  Globe,
  HardDrive,
  KeyRound,
  LayoutTemplate,
  MapIcon,
  Settings2,
  Shapes,
  ShieldAlert,
  SlidersHorizontal,
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
    name: 'Studio',
    to: '/admin/studio',
    Icon: Sparkles,
    description: 'Categories, Models, Templates and what the Studio spends',
    studio: true,
  },
  {
    name: 'Settings',
    to: '/admin/settings',
    Icon: Settings2,
    description: 'Everything adjustable, grouped by area',
  },
] as const;

/** `studio` entries show only while the Studio is enabled. */
export const settingsSections = [
  {
    name: 'Storage',
    to: '/admin/settings/storage',
    Icon: HardDrive,
    description: 'Where Renditions, Studio Outputs, Template images and Avatars are stored',
  },
  {
    name: 'Limits',
    to: '/admin/settings/limits',
    Icon: SlidersHorizontal,
    description: 'Default storage quota, upload sizes, Downloader and moderation limits',
  },
  {
    name: 'Vault',
    to: '/admin/settings/vault',
    Icon: KeyRound,
    description: 'S3 credentials, CDN URL, fal keys, signing secrets and proxy settings, stored encrypted',
  },
  {
    name: 'Sync excluded paths',
    to: '/admin/settings/sync',
    Icon: FolderX,
    description: 'S3 paths the Sync Files check leaves out',
  },
  {
    name: 'Studio',
    to: '/admin/settings/studio',
    Icon: Sparkles,
    description: 'Budgets, the active Generation limit, Output lifetime and file sizes',
    studio: true,
  },
] as const;

export const studioSections = [
  {
    name: 'Categories',
    to: '/admin/studio/categories',
    Icon: Shapes,
    description: 'Define the tasks Users start from in the Studio',
  },
  {
    name: 'Models',
    to: '/admin/studio/models',
    Icon: Sparkles,
    description: 'Add fal Models and choose which inputs Users see',
  },
  {
    name: 'Templates',
    to: '/admin/studio/templates',
    Icon: LayoutTemplate,
    description: 'Write prompts with Variables Users fill in',
  },
  {
    name: 'Overview',
    to: '/admin/studio/overview',
    Icon: BarChart3,
    description: 'Spend, Budgets, failures and running Generations',
  },
] as const;
