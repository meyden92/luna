/**
 * Centralized cache key constants for TanStack Query
 * Use these to ensure consistent cache key usage across the application
 */

export type GallerySortField = 'createdAt' | 'updatedAt' | 'name' | 'size';

export interface GalleryFilters {
  search?: string;
  startDate?: string;
  endDate?: string;
  fileType?: 'image' | 'video' | 'file';
  fileTypeOperator?: 'is' | 'is not';
  folderId?: string | null;
  privacy?: 'public' | 'private';
  tags?: string[];
  tagsOperator?: 'is' | 'is not' | 'one of' | 'none of';
  excludeFoldered?: boolean;
  sortBy?: GallerySortField;
  sortDirection?: 'asc' | 'desc';
}

export const queryKeys = {
  gallery: {
    all: ['gallery'] as const,
    list: (filters?: GalleryFilters) => ['gallery', filters] as const,
  },
  folders: {
    all: ['folders'] as const,
  },
  tags: {
    all: ['tags'] as const,
  },
  admin: {
    users: ['admin', 'users'] as const,
    usersWithFiles: (search?: Record<string, unknown>) => ['admin', 'users', 'with-files', search] as const,
    user: (id: string) => ['admin', 'user', id] as const,
    userFiles: (id: string, search: Record<string, unknown>) => ['admin', 'user', id, 'files', search] as const,
    deletedFiles: ['admin', 'deleted-files'] as const,
  },
  adminAudit: {
    models: ['admin', 'audit', 'models'] as const,
    logs: (search: Record<string, unknown>) => ['admin', 'audit', 'logs', search] as const,
    log: (id: string) => ['admin', 'audit', 'log', id] as const,
  },
  formShares: {
    all: ['form-shares'] as const,
  },
  userSettings: {
    all: ['user-settings'] as const,
  },
  bins: {
    all: ['dashboard', 'bins'] as const,
    mine: ['dashboard', 'bins', 'mine'] as const,
    detail: (id: string) => ['dashboard', 'bins', 'detail', id] as const,
  },
  tokens: {
    all: ['tokens'] as const,
  },
  nicotine: {
    entries: ['nicotine', 'entries'] as const,
  },
  sync: {
    compare: ['sync', 'compare'] as const,
  },
  storage: {
    usage: ['storage', 'usage'] as const,
  },
  health: {
    all: ['health'] as const,
  },
  files: {
    all: ['files'] as const,
    list: (filters?: Record<string, unknown>) => ['files', filters] as const,
    detail: (id: string) => ['files', id] as const,
  },
  user: {
    profile: ['user', 'profile'] as const,
    settings: ['user', 'settings'] as const,
    theme: ['user', 'theme'] as const,
    session: ['user', 'session'] as const,
    sessions: ['user', 'sessions'] as const,
    locale: ['user', 'locale'] as const,
    sharex: ['user', 'sharex-config'] as const,
  },
  ai: {
    models: ['ai', 'models'] as const,
    templates: ['templates'] as const,
    activeTemplate: ['ai', 'template', 'active'] as const,
    templateById: (id: string) => ['ai', 'template', id] as const,
    presets: (modelId: string) => ['ai', 'presets', modelId] as const,
    imageGenerationHistory: ['ai', 'history', 'generation'] as const,
    imageEditHistory: ['ai', 'history', 'edit'] as const,
    templateHistory: ['ai', 'history', 'template'] as const,
  },
  adminTasks: {
    all: ['admin', 'tasks'] as const,
    detail: (id: string) => ['admin', 'tasks', id] as const,
    logs: (id?: string) => (id ? (['admin', 'tasks', id, 'logs'] as const) : (['admin', 'tasks', 'logs'] as const)),
    functions: ['admin', 'tasks', 'functions'] as const,
    stats: (period: string) => ['admin', 'task-stats', period] as const,
    recentExecutions: ['admin', 'task-executions', 'recent'] as const,
    execution: (id: string | null) => ['admin', 'task-execution', id] as const,
    manager: ['tasks'] as const,
  },
  adminTemplates: {
    all: ['admin', 'templates'] as const,
    detail: (id: string) => ['admin', 'templates', id] as const,
    list: ['admin', 'templates', 'list'] as const,
    edit: (id: string) => ['admin', 'templates', 'edit', id] as const,
    formData: ['admin', 'templates', 'form-data'] as const,
  },
  adminModels: {
    editing: ['admin', 'models', 'editing'] as const,
    editingById: (id: string) => ['admin', 'models', 'editing', id] as const,
    editingFields: (id: string) => ['admin', 'models', 'editing', id, 'fields'] as const,
    generation: ['admin', 'models', 'generation'] as const,
    generationById: (id: string) => ['admin', 'models', 'generation', id] as const,
  },
  adminGlobalVars: {
    all: ['admin', 'global-variables'] as const,
    detail: (id: string) => ['admin', 'global-variables', id] as const,
    withUsage: ['admin', 'global-variables', 'with-usage'] as const,
  },
  adminRbac: {
    userGroups: (userId: string) => ['admin', 'rbac', 'users', userId, 'groups'] as const,
    currentUserIsAdmin: ['admin', 'rbac', 'current-user-is-admin'] as const,
  },
  aiModels: {
    generation: ['generationModels'] as const,
    editing: ['editingModels'] as const,
  },
  cachedImages: {
    all: ['cached-images'] as const,
    byPurpose: (purpose: string) => ['cached-images', purpose] as const,
  },
  platform: {
    file: (id: string) => ['platform', 'file', id] as const,
    formShare: (id: string) => ['platform', 'form-share', id] as const,
  },
  dashboard: {
    playerFiles: ['dashboard', 'player', 'files'] as const,
    settingsOverview: ['dashboard', 'settings-overview'] as const,
    previewSelection: (search: Record<string, unknown>) => ['dashboard', 'preview', 'selection', search] as const,
    profile: (id: string) => ['dashboard', 'profile', id] as const,
    calendarEvents: (year: number, month: number) => ['calendar-events', year, month] as const,
  },
  landing: {
    stats: ['landing-stats'] as const,
  },
} as const;
