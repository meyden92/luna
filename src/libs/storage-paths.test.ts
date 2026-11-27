import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_STORAGE_PATH_TEMPLATES,
  matchesStoragePath,
  renderStoragePath,
  STORAGE_PATH_NAMES,
  storagePathProblem,
} from './storage-paths';

describe('storagePathProblem', () => {
  test('accepts every default template', () => {
    for (const name of STORAGE_PATH_NAMES) expect(storagePathProblem(name, DEFAULT_STORAGE_PATH_TEMPLATES[name])).toBeNull();
  });

  test.each([
    ['', 'empty'],
    ['/studio/{generationId}/{index}', 'must not start with "/"'],
    ['studio//{generationId}/{index}', 'empty segments'],
    ['studio/{generationId}/{index}/', 'empty segments'],
    ['studio/../{generationId}/{index}', '".."'],
    ['studio/{generationId}/{index}/{fileId}', 'Unknown variable {fileId}'],
    ['studio/{generationId}.png', 'needs {index}'],
    ['studio/{generationId}/{index} copy', 'only letters'],
    ['studio/{generationId/{index}', 'needs {generationId}'],
    ['studio/{generationId}/{index}}', 'only letters'],
    ['{userId}/studio/{generationId}/{index}', 'first folder must be fixed'],
  ])('refuses the Output path %p', (template, problem) => {
    expect(storagePathProblem('studioOutputPath', template)).toContain(problem);
  });

  test('lets Renditions start inside the owner’s folder', () => {
    expect(storagePathProblem('renditionPath', '{userId}/cache/{fileId}-{hash}.{ext}')).toBeNull();
  });
});

describe('renderStoragePath', () => {
  test('fills the variables and the UTC date', () => {
    const key = renderStoragePath<'studioOutputPath'>(
      'studio/{yyyy}/{mm}/{dd}/{userId}/{generationId}/{index}.{ext}',
      { userId: 'u1', generationId: 'g1', index: 0, ext: 'png' },
      new Date('2026-03-04T23:30:00-02:00'),
    );
    expect(key).toBe('studio/2026/03/05/u1/g1/0.png');
  });
});

describe('matchesStoragePath', () => {
  const template = 'static/avatar/{uuid}.webp';

  test('matches a key rendered from the template', () => {
    expect(matchesStoragePath(template, renderStoragePath<'avatarPath'>(template, { uuid: 'abc-123' }))).toBe(true);
  });

  test.each(['static/avatar/a/b.webp', 'static/avatar/.webp', 'static/avatarXabc.webp', 'user-id/photo.webp'])(
    'does not match %p',
    (key) => {
      expect(matchesStoragePath(template, key)).toBe(false);
    },
  );
});
