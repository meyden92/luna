import { useCallback, useEffect, useState } from 'react';

export function useInteractiveLegend(allSeriesKeys: string[]) {
  const [activeKeys, setActiveKeys] = useState<string[]>(allSeriesKeys);
  const [hoveredLegendKey, setHoveredLegendKey] = useState<string | undefined>(undefined);

  useEffect(() => {
    setActiveKeys((prev) => {
      const kept = prev.filter((k) => allSeriesKeys.includes(k));
      const added = allSeriesKeys.filter((k) => !prev.includes(k));
      return [...kept, ...added];
    });
  }, [allSeriesKeys]);

  const toggleKey = useCallback((key: string) => {
    setActiveKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }, []);

  const onLegendMouseEnter = useCallback((id: string) => setHoveredLegendKey(id), []);

  const onLegendMouseLeave = useCallback(() => setHoveredLegendKey(undefined), []);

  return { activeKeys, toggleKey, hoveredLegendKey, onLegendMouseEnter, onLegendMouseLeave } as const;
}
