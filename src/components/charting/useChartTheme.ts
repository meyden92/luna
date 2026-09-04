import { useCallback, useMemo } from 'react';
import { resolveCssColor } from '@/libs/css-color';

export type ChartTheme = {
  text: string;
  grid: string;
  tooltipBg: string;
  tooltipText: string;
  seriesPalette: string[];
  getColorByKey: (keys: string[]) => Map<string, string>;
  withAlpha: (color: string, alpha: number) => string;
  getContrastingTextColor: (color: string) => string;
  nivoTheme: {
    text: { fill: string; fontSize: number };
    axis: {
      domain: { line: { stroke: string; strokeWidth: number } };
      ticks: { line: { stroke: string; strokeWidth: number }; text: { fill: string } };
    };
    grid: { line: { stroke: string; strokeWidth: number } };
    legends: { text: { fill: string } };
    tooltip: {
      container: { background: string; color: string; fontSize: number; borderRadius: number; boxShadow: string; padding: number };
    };
  };
};

export function useChartTheme(): ChartTheme {
  const readVar = useCallback((name: string, fallback: string) => resolveCssColor(name, fallback), []);

  const withAlpha = useCallback((color: string, alpha: number) => {
    const a = Math.max(0, Math.min(1, alpha));
    const trimmed = color.trim();
    if (trimmed.startsWith('rgba(')) return trimmed.replace(/rgba\(([^)]+)\)/, `rgba($1, ${a})`);
    if (trimmed.startsWith('rgb(')) return trimmed.replace('rgb(', 'rgba(').replace(')', `, ${a})`);
    if (trimmed.startsWith('#')) {
      const hex = trimmed.slice(1);
      const expanded =
        hex.length === 3
          ? hex
              .split('')
              .map((c) => c + c)
              .join('')
          : hex;
      const bigint = Number.parseInt(expanded, 16);
      const r = (bigint >> 16) & 255;
      const g = (bigint >> 8) & 255;
      const b = bigint & 255;
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
    return trimmed;
  }, []);

  const seriesPalette = useMemo(
    () => [
      readVar('--chart-1', '#60a5fa'),
      readVar('--chart-2', '#34d399'),
      readVar('--chart-3', '#fbbf24'),
      readVar('--chart-4', '#a78bfa'),
      readVar('--chart-5', '#fb7185'),
    ],
    [readVar],
  );

  const text = readVar('--foreground', '#374151');
  const grid = readVar('--border', '#e5e7eb');
  const tooltipBg = readVar('--popover', '#ffffff');
  const tooltipText = readVar('--popover-foreground', '#111827');

  const getColorByKey = useCallback(
    (keys: string[]) => {
      const map = new Map<string, string>();
      keys.forEach((k, i) => {
        map.set(k, seriesPalette[i % seriesPalette.length] ?? '#999999');
      });
      return map;
    },
    [seriesPalette],
  );

  const getContrastingTextColor = useCallback((color: string) => {
    const c = color.trim();
    let r = 0;
    let g = 0;
    let b = 0;
    if (c.startsWith('#')) {
      const hex = c.slice(1);
      const expanded =
        hex.length === 3
          ? hex
              .split('')
              .map((x) => x + x)
              .join('')
          : hex;
      const n = Number.parseInt(expanded, 16);
      r = (n >> 16) & 255;
      g = (n >> 8) & 255;
      b = n & 255;
    } else if (c.startsWith('rgb')) {
      const parts = c
        .replace(/rgba?\(|\)/g, '')
        .split(',')
        .map((x) => Number.parseFloat(x.trim()));
      r = Number(parts[0] ?? 0);
      g = Number(parts[1] ?? 0);
      b = Number(parts[2] ?? 0);
    } else {
      return '#111827';
    }
    const sr = r / 255;
    const sg = g / 255;
    const sb = b / 255;
    const a = [sr, sg, sb].map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    const luminance = 0.2126 * (a[0] ?? 0) + 0.7152 * (a[1] ?? 0) + 0.0722 * (a[2] ?? 0);
    return luminance > 0.6 ? '#111827' : '#F9FAFB';
  }, []);

  const nivoTheme = useMemo(
    () => ({
      text: { fill: text, fontSize: 12 },
      axis: {
        domain: { line: { stroke: grid, strokeWidth: 1 } },
        ticks: { line: { stroke: grid, strokeWidth: 1 }, text: { fill: text } },
      },
      grid: { line: { stroke: grid, strokeWidth: 1 } },
      legends: { text: { fill: text } },
      tooltip: {
        container: {
          background: tooltipBg,
          color: tooltipText,
          fontSize: 12,
          borderRadius: 6,
          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
          padding: 8,
        },
      },
    }),
    [text, grid, tooltipBg, tooltipText],
  );

  return { text, grid, tooltipBg, tooltipText, seriesPalette, getColorByKey, withAlpha, getContrastingTextColor, nivoTheme };
}
