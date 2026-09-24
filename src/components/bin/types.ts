import type { listBins } from '@/server/fns/bins';

/** A snippet row as returned by the bin server functions, shared across the Snippets split view. */
export type Bin = Awaited<ReturnType<typeof listBins>>[number];
