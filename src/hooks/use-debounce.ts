import { useCallback, useRef } from 'react';

export function useDebounce<T extends unknown[]>(callback: (...args: T) => void, delay: number): (...args: T) => void {
  const timeoutRef = useRef<number | undefined>(undefined);

  return useCallback(
    (...args: T) => {
      if (timeoutRef.current !== undefined) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => callback(...args), delay);
    },
    [callback, delay],
  );
}
