import { type InfiniteData, type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { queryKeys } from '@/libs/query-keys';
import type { StudioEvent } from '@/libs/studio/events';
import type { GenerationStatus, MediaKind } from '@/libs/studio/types';
import type { GenerationView } from '@/libs/studio/views';
import type { GenerationsPage } from './queries';
import { studioStatusQueryOptions } from './studio-status';

const FINISHED: readonly GenerationStatus[] = ['succeeded', 'failed', 'cancelled'];
const READY_TOAST_MS = 8000;

const READY_LABEL: Record<MediaKind, string> = {
  image: 'Image ready',
  video: 'Video ready',
  audio: 'Audio ready',
  model3d: '3D model ready',
};

type HistoryData = InfiniteData<GenerationsPage>;

/** The status the cached history knows for a Generation, if it lists it. */
function cachedStatus(queryClient: QueryClient, id: string): GenerationStatus | undefined {
  for (const [, data] of queryClient.getQueriesData<HistoryData>({ queryKey: queryKeys.studio.generationsAll })) {
    const found = data?.pages.flatMap((page) => page.generations).find((generation) => generation.id === id);
    if (found) return found.status;
  }
  return undefined;
}

/** Replaces the Generation in every cached history list holding it (or drops it); refetches the lists that do not hold it. */
function patchHistory(queryClient: QueryClient, id: string, next: GenerationView | null) {
  for (const query of queryClient.getQueryCache().findAll({ queryKey: queryKeys.studio.generationsAll })) {
    const data = query.state.data as HistoryData | undefined;
    const holds = data?.pages.some((page) => page.generations.some((generation) => generation.id === id));
    if (!holds) {
      if (next) void queryClient.invalidateQueries({ queryKey: query.queryKey, exact: true });
      continue;
    }
    queryClient.setQueryData<HistoryData>(query.queryKey, (current) =>
      current
        ? {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              generations: next
                ? page.generations.map((generation) => (generation.id === id ? next : generation))
                : page.generations.filter((generation) => generation.id !== id),
            })),
          }
        : current,
    );
  }
}

/**
 * Holds the User's Studio event stream for every signed-in page while the
 * Studio is enabled: it keeps the history live, raises a toast when a
 * Generation finishes, and refreshes the nav badge's count.
 */
export function StudioEvents() {
  const { data: status } = useQuery(studioStatusQueryOptions);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const enabled = status?.enabled ?? false;

  useEffect(() => {
    if (!enabled) return;
    const source = new EventSource('/api/studio/events');
    // What this tab last heard per Generation, so a later update (Save to Files) does not toast again.
    const statuses = new Map<string, GenerationStatus>();

    // Events missed while disconnected are not replayed: catch up from the server.
    source.onopen = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.studio.generationsAll });
      void queryClient.invalidateQueries({ queryKey: queryKeys.studio.unseen });
    };

    source.onmessage = (message: MessageEvent<string>) => {
      const event = JSON.parse(message.data) as StudioEvent;
      if (event.type === 'generation.deleted') {
        patchHistory(queryClient, event.id, null);
        void queryClient.invalidateQueries({ queryKey: queryKeys.studio.unseen });
        return;
      }

      const { generation } = event;
      const previous = statuses.get(generation.id) ?? cachedStatus(queryClient, generation.id);
      statuses.set(generation.id, generation.status);
      patchHistory(queryClient, generation.id, generation);
      queryClient.setQueryData(queryKeys.studio.generation(generation.id), (current: GenerationView | undefined) =>
        current ? generation : current,
      );

      const justFinished = FINISHED.includes(generation.status) && !(previous && FINISHED.includes(previous));
      if (!justFinished) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.studio.unseen });
      void queryClient.invalidateQueries({ queryKey: queryKeys.studio.budget });
      if (generation.seenAt || generation.status === 'cancelled') return;

      const view = { label: 'View', onClick: () => navigate({ to: '/studio' }) };
      if (generation.status === 'failed') {
        toast.error(`${generation.name} failed`, { description: generation.error?.message, action: view, duration: READY_TOAST_MS });
      } else {
        const kind = generation.outputs[0]?.mediaKind ?? 'image';
        toast.success(READY_LABEL[kind], { description: generation.name, action: view, duration: READY_TOAST_MS });
      }
    };

    return () => source.close();
  }, [enabled, queryClient, navigate]);

  return null;
}
