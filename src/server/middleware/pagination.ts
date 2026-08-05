import { createMiddleware } from '@tanstack/react-start';

export type PaginationInput = {
  page: number;
  limit: number;
  cursor?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
};

export type PaginationConfig = {
  defaultLimit?: number;
  maxLimit?: number;
};

function parse(url: URL, cfg: PaginationConfig): PaginationInput {
  const defaultLimit = cfg.defaultLimit ?? 20;
  const maxLimit = cfg.maxLimit ?? 100;
  const sp = url.searchParams;

  const rawPage = sp.get('page');
  const rawLimit = sp.get('limit');
  const cursor = sp.get('cursor') || undefined;
  const sortBy = sp.get('sortBy') || undefined;
  const sortDirection = (sp.get('sortDirection') as 'asc' | 'desc' | null) || undefined;

  const page = rawPage ? Math.max(1, Number.parseInt(rawPage, 10) || 1) : 1;
  const limit = rawLimit ? Math.min(maxLimit, Math.max(1, Number.parseInt(rawLimit, 10) || defaultLimit)) : defaultLimit;

  return { page, limit, cursor, sortBy, sortDirection };
}

export const paginatedMiddleware = (cfg: PaginationConfig = {}) =>
  createMiddleware({ type: 'function' }).server(async ({ next }) => {
    const { getRequest } = await import('@tanstack/react-start/server');
    const request = getRequest();
    const pagination = parse(new URL(request.url), cfg);
    return next({ context: { pagination } });
  });
