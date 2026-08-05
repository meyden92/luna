import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useFolders } from '@/contexts/FoldersContext';
import { queryKeys } from '@/libs/query-keys';
import { listTags } from '@/server/fns/system';

export interface FilterOptionsContext {
  folders: { id: string; name: string; color: string | null }[];
  tags: string[];
}

export function useFilterOptions(): FilterOptionsContext {
  const { folders } = useFolders();

  const { data: tagsData } = useQuery({
    queryKey: queryKeys.tags.all,
    queryFn: async () => {
      return listTags();
    },
    staleTime: 1000 * 60 * 5,
  });

  return useMemo(
    () => ({
      folders: folders.map((f) => ({ id: f.id, name: f.name, color: f.color })),
      tags: tagsData || [],
    }),
    [folders, tagsData],
  );
}
