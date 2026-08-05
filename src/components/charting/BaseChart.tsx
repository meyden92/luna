import { useMemo } from 'react';
import type { ChartMarker } from './types';
import { useChartTheme } from './useChartTheme';
import { useInteractiveLegend } from './useInteractiveLegend';

export type AnyDatum = Record<string, string | number | Date | null | undefined>;

export function inferIndexKey<T extends AnyDatum>(rows: T[]): string {
  if (!rows || rows.length === 0) return 'category';
  const sample = rows[0]!;
  if ('category' in sample) return 'category';
  const stringLike = Object.keys(sample as AnyDatum).find((k) => {
    const v = sample[k];
    return typeof v === 'string' || v instanceof Date;
  });
  return stringLike ?? Object.keys(sample as AnyDatum)[0] ?? 'category';
}

export function inferSeriesKeys<T extends AnyDatum>(rows: T[], indexKey: string): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key === indexKey) continue;
      const v = row[key];
      if (typeof v === 'number' && Number.isFinite(v)) keys.add(key);
    }
  }
  return Array.from(keys);
}

export interface BaseChartProps<T extends AnyDatum = AnyDatum> {
  data: T[];
  showLegend?: boolean;
  isLegendInteractive?: boolean;
  summarizeTooltip?: boolean;
  formatValue?: (n: number) => string;
  formatIndex?: (v: string | number | Date) => string;
  xTickValues?: Array<string | number | Date>;
  height?: number | string;
  width?: number | string;
  markers?: ChartMarker[];
  seriesColors?: Record<string, string>;
}

export interface UseBaseChartReturn {
  indexKey: string;
  allSeriesKeys: string[];
  activeKeys: string[];
  toggleKey: (key: string) => void;
  hoveredLegendKey: string | null | undefined;
  onLegendMouseEnter: (key: string) => void;
  onLegendMouseLeave: () => void;
  withAlpha: (color: string, alpha: number) => string;
  nivoTheme: any;
  getColorByKey: (keys: string[]) => Map<string, string>;
  getContrastingTextColor: (color: string) => string;
  colorByKey: Map<string, string>;
}

export function useBaseChart<T extends AnyDatum>(data: T[], seriesColors?: Record<string, string>): UseBaseChartReturn {
  const indexKey = useMemo(() => inferIndexKey(data), [data]);
  const allSeriesKeys = useMemo(() => inferSeriesKeys(data, indexKey), [data, indexKey]);
  const { activeKeys, toggleKey, hoveredLegendKey, onLegendMouseEnter, onLegendMouseLeave } = useInteractiveLegend(allSeriesKeys);
  const { withAlpha, nivoTheme, getColorByKey, getContrastingTextColor } = useChartTheme();

  const colorByKey = useMemo(() => {
    const baseColors = getColorByKey(allSeriesKeys);
    if (seriesColors) {
      for (const [key, color] of Object.entries(seriesColors)) {
        if (baseColors.has(key)) {
          baseColors.set(key, color);
        }
      }
    }
    return baseColors;
  }, [getColorByKey, allSeriesKeys, seriesColors]);

  return {
    indexKey,
    allSeriesKeys,
    activeKeys,
    toggleKey,
    hoveredLegendKey,
    onLegendMouseEnter,
    onLegendMouseLeave,
    withAlpha,
    nivoTheme,
    getColorByKey,
    getContrastingTextColor,
    colorByKey,
  };
}

export function createNivoLineMarkers(markers: ChartMarker[] | undefined, textFill: string): any[] | undefined {
  if (!markers || markers.length === 0) return undefined;

  const lineMarkers = markers
    .filter((m) => m.type === 'line')
    .map((m) => {
      const line = m as any;

      // Check if it's using the full Nivo API or simplified API
      const isSimple = 'color' in line || 'width' in line || line.axis === 'value' || line.axis === 'index';

      if (!isSimple) {
        // Direct pass-through of Nivo properties
        return {
          axis: line.axis ?? 'y',
          value: line.value,
          legend: line.legend,
          legendPosition: line.legendPosition,
          legendOrientation: line.legendOrientation,
          legendOffset: line.legendOffset,
          legendOffsetX: line.legendOffsetX,
          legendOffsetY: line.legendOffsetY,
          lineStyle: line.lineStyle ?? {},
          textStyle: line.textStyle ?? { fill: textFill, fontSize: 12 },
        };
      }

      // Handle simplified API with backwards compatibility
      const toNivoPosition = (pos: 'start' | 'middle' | 'end' | undefined): string => {
        if (pos === 'start') return 'bottom-left';
        if (pos === 'middle') return 'top';
        return 'top-right';
      };

      return {
        axis: line.axis === 'index' ? 'x' : 'y',
        value: line.value,
        lineStyle: {
          stroke: line.color ?? '#ef4444',
          strokeWidth: line.width ?? 2,
        },
        legend: line.legend,
        legendPosition: toNivoPosition(line.legendPosition),
        legendOrientation: 'horizontal',
        textStyle: { fill: textFill, fontSize: 12 },
        legendOffset: line.legendOffset ?? 12,
      };
    });
  return lineMarkers.length ? lineMarkers : undefined;
}

export function createNivoBarMarkers(markers: ChartMarker[] | undefined, horizontal: boolean, textFill: string): any[] | undefined {
  if (!markers || markers.length === 0) return undefined;

  const lineMarkers = markers
    .filter((m) => m.type === 'line')
    .map((m) => {
      const line = m as any;

      // Check if it's using the full Nivo API or simplified API
      const isSimple = 'color' in line || 'width' in line || line.axis === 'value' || line.axis === 'index';

      if (!isSimple) {
        // Direct pass-through of Nivo properties
        return {
          axis: line.axis ?? (horizontal ? 'x' : 'y'),
          value: line.value,
          legend: line.legend,
          legendPosition: line.legendPosition,
          legendOrientation: line.legendOrientation,
          legendOffset: line.legendOffset,
          legendOffsetX: line.legendOffsetX,
          legendOffsetY: line.legendOffsetY,
          lineStyle: line.lineStyle ?? {},
          textStyle: line.textStyle ?? { fill: textFill, fontSize: 12 },
        };
      }

      // Handle simplified API with backwards compatibility
      const axisValueToNivo = (axis: 'value' | 'index'): 'x' | 'y' =>
        !horizontal ? (axis === 'index' ? 'x' : 'y') : axis === 'index' ? 'y' : 'x';
      const toNivoPosition = (pos: 'start' | 'middle' | 'end' | undefined): string => {
        if (pos === 'start') return 'bottom-left';
        if (pos === 'middle') return 'top';
        return 'top-right';
      };

      return {
        axis: axisValueToNivo(line.axis ?? 'value'),
        value: line.value,
        lineStyle: {
          stroke: line.color ?? '#ef4444',
          strokeWidth: line.width ?? 2,
        },
        legend: line.legend,
        legendPosition: toNivoPosition(line.legendPosition),
        legendOrientation: 'horizontal',
        textStyle: { fill: textFill, fontSize: 12 },
        legendOffset: line.legendOffset ?? 12,
      };
    });
  return lineMarkers.length ? lineMarkers : undefined;
}

export function createLegendConfig(
  showLegend: boolean,
  isLegendInteractive: boolean,
  activeKeys: string[],
  toggleKey: (key: string) => void,
  onLegendMouseEnter: (key: string) => void,
  onLegendMouseLeave: () => void,
  bottom = false,
) {
  if (!showLegend) return undefined;
  return [
    {
      anchor: 'bottom' as const,
      direction: 'row' as const,
      translateY: bottom ? 56 : 52,
      itemWidth: 100,
      itemHeight: 18,
      itemsSpacing: 10,
      symbolSize: 14,
      symbolShape: 'circle' as const,
      onClick: isLegendInteractive
        ? (d: any) => {
            const id = String(d.id ?? d.label ?? d);
            toggleKey(id);
          }
        : undefined,
      onMouseEnter: (d: any) => {
        const id = String(d.id ?? d.label ?? d);
        if (activeKeys.includes(id)) onLegendMouseEnter(id);
      },
      onMouseLeave: () => onLegendMouseLeave(),
      effects: [
        {
          on: 'hover' as const,
          style: { itemOpacity: 1 },
        },
      ],
    },
  ];
}
