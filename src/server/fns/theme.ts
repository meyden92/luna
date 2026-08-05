import { createServerFn } from '@tanstack/react-start';
import { getCookie } from '@tanstack/react-start/server';
import type { Theme } from '@/route-context';

const VALID_THEMES = new Set<Theme>(['default', 'light', 'dark']);

export const getInitialTheme = createServerFn({ method: 'GET' }).handler<Theme>(() => {
  const raw = getCookie('theme');
  if (raw && VALID_THEMES.has(raw as Theme)) return raw as Theme;
  return 'default';
});
