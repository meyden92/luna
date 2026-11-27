/**
 * S3 key templates for system objects. A template is a relative key whose
 * `{name}` placeholders are filled when an object is stored; the key is then
 * saved with the object's row, so changing a template never moves existing
 * objects. Client-safe: the settings form validates and previews with it.
 */

const DATE_VARIABLES = ['yyyy', 'mm', 'dd'] as const;

export const STORAGE_PATHS = {
  renditionPath: {
    label: 'Renditions',
    description: 'Resized and converted images served by transform-on-URL links.',
    defaultTemplate: '{userId}/renditions/{fileId}/{hash}.{ext}',
    variables: ['userId', 'fileId', 'hash', 'ext', ...DATE_VARIABLES],
    required: ['fileId', 'hash'],
    // Renditions belong to their file's owner, so they may live inside the owner's folder.
    variableFirstSegment: true,
  },
  studioOutputPath: {
    label: 'Studio Outputs',
    description: 'Generated Outputs until they expire or are saved to Files.',
    defaultTemplate: 'studio/{userId}/{generationId}/{index}.{ext}',
    variables: ['userId', 'generationId', 'index', 'ext', ...DATE_VARIABLES],
    required: ['generationId', 'index'],
    variableFirstSegment: false,
  },
  templatePreviewPath: {
    label: 'Template previews',
    description: 'Preview images shown on a Template.',
    defaultTemplate: 'studio-templates/{uuid}.{ext}',
    variables: ['uuid', 'ext', ...DATE_VARIABLES],
    required: ['uuid'],
    variableFirstSegment: false,
  },
  templateReferencePath: {
    label: 'Template reference images',
    description: 'Reference images a Template sends with every Generation.',
    defaultTemplate: 'studio-templates/{uuid}.{ext}',
    variables: ['uuid', 'ext', ...DATE_VARIABLES],
    required: ['uuid'],
    variableFirstSegment: false,
  },
  avatarPath: {
    label: 'Avatars',
    description: 'Profile pictures, stored as WebP.',
    defaultTemplate: 'static/avatar/{uuid}.webp',
    variables: ['uuid', ...DATE_VARIABLES],
    required: ['uuid'],
    variableFirstSegment: false,
  },
} as const;

export type StoragePathName = keyof typeof STORAGE_PATHS;
export type StoragePathTemplates = Record<StoragePathName, string>;
type Variable<P extends StoragePathName> = (typeof STORAGE_PATHS)[P]['variables'][number];
/** The values a path's key is built from; the date variables are filled in by `renderStoragePath`. */
export type StoragePathValues<P extends StoragePathName> = Record<Exclude<Variable<P>, (typeof DATE_VARIABLES)[number]>, string | number>;

export const STORAGE_PATH_NAMES = Object.keys(STORAGE_PATHS) as StoragePathName[];

export const DEFAULT_STORAGE_PATH_TEMPLATES = Object.fromEntries(
  STORAGE_PATH_NAMES.map((name) => [name, STORAGE_PATHS[name].defaultTemplate]),
) as StoragePathTemplates;

const PLACEHOLDER = /\{([^{}]*)\}/g;
const LITERAL = /^[A-Za-z0-9._/-]*$/;

/** Why a template cannot be used, or null when it is valid. */
export function storagePathProblem(name: StoragePathName, template: string): string | null {
  const path = STORAGE_PATHS[name];
  const allowed: readonly string[] = path.variables;
  if (template.trim() === '') return 'The path is empty.';
  if (template.startsWith('/')) return 'The path must not start with "/".';
  const segments = template.split('/');
  if (segments.some((segment) => segment === '')) return 'The path must not contain empty segments ("//" or a trailing "/").';
  if (segments.some((segment) => segment === '.' || segment === '..')) return 'The path must not contain "." or ".." segments.';

  const used = [...template.matchAll(PLACEHOLDER)].map((match) => match[1] ?? '');
  const unknown = used.filter((variable) => !allowed.includes(variable));
  if (unknown.length > 0) return `Unknown variable ${unknown.map((variable) => `{${variable}}`).join(', ')}.`;
  const missing = path.required.filter((variable) => !used.includes(variable));
  if (missing.length > 0) return `The path needs ${missing.map((variable) => `{${variable}}`).join(', ')} so every key is unique.`;
  if (!LITERAL.test(template.replace(PLACEHOLDER, ''))) return 'Outside variables, use only letters, digits, ".", "_", "-" and "/".';
  if (!path.variableFirstSegment && segments[0]?.includes('{')) {
    return 'The first folder must be fixed text, so these objects never land in a User’s folder.';
  }
  return null;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Builds a key from a valid template; the date variables use the current UTC date. */
export function renderStoragePath<P extends StoragePathName>(template: string, values: StoragePathValues<P>, now = new Date()): string {
  const all: Record<string, string | number> = {
    ...values,
    yyyy: now.getUTCFullYear(),
    mm: pad(now.getUTCMonth() + 1),
    dd: pad(now.getUTCDate()),
  };
  return template.replace(PLACEHOLDER, (_, variable: string) => String(all[variable]));
}

/** Whether a key could have been built from the template, each variable standing for one non-empty run without "/". */
export function matchesStoragePath(template: string, key: string): boolean {
  const pattern = template
    .split(PLACEHOLDER)
    .map((part, index) => (index % 2 === 1 ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return new RegExp(`^${pattern}$`).test(key);
}
