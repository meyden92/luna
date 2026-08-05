import { createContext, type RefObject, useContext } from 'react';
import type { UploadHandle } from '@/components/dashboard/FloatingUploadButton';

export const UploadRefContext = createContext<RefObject<UploadHandle | null> | null>(null);

export function useUploadRef(): RefObject<UploadHandle | null> {
  const ctx = useContext(UploadRefContext);
  if (!ctx) {
    throw new Error('useUploadRef must be used inside UploadRefContext.Provider');
  }
  return ctx;
}
