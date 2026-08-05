import { useQuery } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { queryKeys } from '@/libs/query-keys';
import { listFolders } from '@/server/fns/folders';

interface Folder {
  id: string;
  name: string;
  color: string | null;
  _count: { files: number };
}

interface FoldersContextValue {
  folders: Folder[];
  isLoading: boolean;
}

const EMPTY_FOLDERS: Folder[] = [];
const FoldersContext = createContext<FoldersContextValue | null>(null);

export function FoldersProvider({ children }: { children: ReactNode }) {
  const { data: folders = EMPTY_FOLDERS, isLoading } = useQuery({
    queryKey: queryKeys.folders.all,
    queryFn: async () => {
      return listFolders();
    },
    staleTime: Number.POSITIVE_INFINITY, // Only refetch on cache invalidation (after mutations)
  });

  const value = useMemo(() => ({ folders, isLoading }), [folders, isLoading]);

  return <FoldersContext.Provider value={value}>{children}</FoldersContext.Provider>;
}

export function useFolders() {
  const context = useContext(FoldersContext);
  if (!context) {
    throw new Error('useFolders must be used within a FoldersProvider');
  }
  return context;
}
