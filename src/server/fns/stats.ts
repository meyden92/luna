import { createServerFn } from '@tanstack/react-start';
import { getLandingCounts } from '@/db/queries/analytics';

export const getLandingStats = createServerFn({ method: 'GET' }).handler(() => getLandingCounts());
