import type { ComputedDatum, PieSvgProps } from '@nivo/pie';
import { ResponsivePie } from '@nivo/pie';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type AnyDatum, type BaseChartProps, inferIndexKey, inferSeriesKeys } from './BaseChart';
import styles from './PieChart.module.css';
import { useChartTheme } from './useChartTheme';

type PieDatum = {
  id: string;
  value: number;
  label?: string;
};

type NivoOverrides = Omit<
  PieSvgProps<PieDatum>,
  'data' | 'colors' | 'legends' | 'tooltip' | 'width' | 'height' | 'margin' | 'theme' | 'layers'
>;

export type PieChartProps<T extends AnyDatum = AnyDatum> = BaseChartProps<T> & {
  // Pie-specific props
  innerRadius?: number;
  padAngle?: number;
  cornerRadius?: number;
  sortByValue?: boolean;

  // Arc labels (on slices)
  enableArcLabels?: boolean;
  arcLabel?: 'id' | 'value' | 'formattedValue' | ((datum: ComputedDatum<PieDatum>) => string);
  arcLabelsSkipAngle?: number;
  arcLabelsTextColor?: string | { from: string; modifiers?: [string, number][] };

  // Arc link labels (lines pointing to slices)
  enableArcLinkLabels?: boolean;
  arcLinkLabel?: 'id' | 'value' | 'formattedValue' | ((datum: ComputedDatum<PieDatum>) => string);
  arcLinkLabelsSkipAngle?: number;
  arcLinkLabelsOffset?: number;
  arcLinkLabelsDiagonalLength?: number;
  arcLinkLabelsStraightLength?: number;
  arcLinkLabelsThickness?: number;
  arcLinkLabelsColor?: string | { from: string; modifiers?: [string, number][] };
  arcLinkLabelsTextColor?: string | { from: string; modifiers?: [string, number][] };

  // Active slice effects
  activeOuterRadiusOffset?: number;
  activeInnerRadiusOffset?: number;

  // Center content (for donut charts)
  centerLabel?: React.ReactNode | ((data: { total: number; formattedTotal: string }) => React.ReactNode);

  // Value field selection (for single-value mode)
  valueKey?: string;
} & Partial<NivoOverrides>;

export default function PieChart<T extends AnyDatum = AnyDatum>({
  data,
  showLegend = true,
  isLegendInteractive = true,
  summarizeTooltip = false,
  formatValue,
  formatIndex,
  height = 420,
  width = '100%',
  seriesColors,
  innerRadius = 0,
  padAngle = 0,
  cornerRadius = 0,
  sortByValue = false,
  enableArcLabels = true,
  arcLabel = 'formattedValue',
  arcLabelsSkipAngle = 10,
  arcLabelsTextColor,
  enableArcLinkLabels = true,
  arcLinkLabel = 'id',
  arcLinkLabelsSkipAngle = 10,
  arcLinkLabelsOffset = 0,
  arcLinkLabelsDiagonalLength = 16,
  arcLinkLabelsStraightLength = 24,
  arcLinkLabelsThickness = 1,
  arcLinkLabelsColor = { from: 'color' },
  arcLinkLabelsTextColor,
  activeOuterRadiusOffset = 8,
  activeInnerRadiusOffset = 0,
  centerLabel,
  valueKey,
  ...nivoProps
}: PieChartProps<T>) {
  // Use chart theme directly
  const { withAlpha, nivoTheme, getColorByKey, getContrastingTextColor } = useChartTheme();

  // Infer index and series keys
  const indexKey = useMemo(() => inferIndexKey(data), [data]);
  const allSeriesKeys = useMemo(() => inferSeriesKeys(data, indexKey), [data, indexKey]);

  // Determine if we're in single-value mode (multiple rows, one numeric field)
  // or multi-series mode (one row, multiple numeric fields)
  const isSingleValueMode = useMemo(() => {
    if (valueKey) return true;
    // If we have multiple rows, prefer single-value mode
    if (data.length > 1) return true;
    return false;
  }, [data.length, valueKey]);

  const effectiveValueKey = useMemo(() => {
    if (valueKey) return valueKey;
    return allSeriesKeys[0] ?? 'value';
  }, [valueKey, allSeriesKeys]);

  // Get all slice IDs - these are what we toggle in the legend
  const allSliceIds = useMemo(() => {
    if (isSingleValueMode) {
      return data.map((row) => String((row as AnyDatum)[indexKey] ?? ''));
    }
    return allSeriesKeys;
  }, [isSingleValueMode, data, indexKey, allSeriesKeys]);

  // Pie chart needs its own activeKeys state since the "keys" differ based on mode
  const [activeSliceIds, setActiveSliceIds] = useState<string[]>(allSliceIds);
  const [hoveredLegendKey, setHoveredLegendKey] = useState<string | undefined>(undefined);

  // Sync activeSliceIds when allSliceIds changes
  useEffect(() => {
    setActiveSliceIds((prev) => {
      const kept = prev.filter((k) => allSliceIds.includes(k));
      const added = allSliceIds.filter((k) => !prev.includes(k));
      return [...kept, ...added];
    });
  }, [allSliceIds]);

  const toggleSlice = useCallback((id: string) => {
    setActiveSliceIds((prev) => (prev.includes(id) ? prev.filter((k) => k !== id) : [...prev, id]));
  }, []);

  const onLegendMouseEnter = useCallback((id: string) => setHoveredLegendKey(id), []);
  const onLegendMouseLeave = useCallback(() => setHoveredLegendKey(undefined), []);

  // Build color map for slices
  const effectiveColorByKey = useMemo(() => {
    if (isSingleValueMode) {
      // In single-value mode, the "series" are the index values (category names)
      const map = new Map<string, string>();
      const palette = ['#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#fb7185'];

      allSliceIds.forEach((id, i) => {
        if (seriesColors?.[id]) {
          map.set(id, seriesColors[id]);
        } else {
          map.set(id, palette[i % palette.length] ?? '#999999');
        }
      });
      return map;
    }
    // Multi-series mode: use series keys for colors
    const baseColors = getColorByKey(allSeriesKeys);
    if (seriesColors) {
      for (const [key, color] of Object.entries(seriesColors)) {
        if (baseColors.has(key)) {
          baseColors.set(key, color);
        }
      }
    }
    return baseColors;
  }, [isSingleValueMode, allSliceIds, allSeriesKeys, seriesColors, getColorByKey]);

  // Transform data to Nivo pie format
  const pieData = useMemo<PieDatum[]>(() => {
    if (isSingleValueMode) {
      // Single-value mode: each row becomes a slice
      return data
        .filter((row) => {
          const id = String((row as AnyDatum)[indexKey] ?? '');
          return activeSliceIds.includes(id);
        })
        .map((row) => {
          const id = String((row as AnyDatum)[indexKey] ?? '');
          const rawValue = (row as AnyDatum)[effectiveValueKey];
          const value = typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : 0;
          const label = formatIndex ? formatIndex((row as AnyDatum)[indexKey] as string | number | Date) : id;
          return { id, value, label };
        });
    }
    // Multi-series mode: each numeric field becomes a slice (from first row)
    const row = data[0] as AnyDatum | undefined;
    if (!row) return [];
    return allSeriesKeys
      .filter((k) => activeSliceIds.includes(k))
      .map((k) => {
        const rawValue = row[k];
        const value = typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : 0;
        return { id: k, value, label: k };
      });
  }, [data, indexKey, allSeriesKeys, activeSliceIds, isSingleValueMode, effectiveValueKey, formatIndex]);

  // All pie data (for summary tooltip - shows all items regardless of active state)
  const allPieData = useMemo<PieDatum[]>(() => {
    if (isSingleValueMode) {
      return data.map((row) => {
        const id = String((row as AnyDatum)[indexKey] ?? '');
        const rawValue = (row as AnyDatum)[effectiveValueKey];
        const value = typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : 0;
        const label = formatIndex ? formatIndex((row as AnyDatum)[indexKey] as string | number | Date) : id;
        return { id, value, label };
      });
    }
    const row = data[0] as AnyDatum | undefined;
    if (!row) return [];
    return allSeriesKeys.map((k) => {
      const rawValue = row[k];
      const value = typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : 0;
      return { id: k, value, label: k };
    });
  }, [data, indexKey, allSeriesKeys, isSingleValueMode, effectiveValueKey, formatIndex]);

  const total = useMemo(() => pieData.reduce((sum, d) => sum + d.value, 0), [pieData]);
  const formattedTotal = useMemo(() => (formatValue ? formatValue(total) : String(total)), [total, formatValue]);

  const computedMargin = useMemo(() => {
    const base = { top: 40, right: 80, bottom: showLegend ? 80 : 40, left: 80 };
    if (enableArcLinkLabels) {
      base.right = Math.max(base.right, 120);
      base.left = Math.max(base.left, 120);
    }
    return base;
  }, [showLegend, enableArcLinkLabels]);

  const tooltip = useCallback(
    (props: { datum: ComputedDatum<PieDatum> }) => {
      const { datum } = props;
      if (!summarizeTooltip) {
        // Default single-item tooltip
        return (
          <div
            style={{
              background: nivoTheme.tooltip.container.background,
              color: nivoTheme.tooltip.container.color,
              padding: 8,
              borderRadius: 6,
              boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 2,
                background: datum.color,
                display: 'inline-block',
              }}
            />
            <span>{datum.label ?? datum.id}</span>
            <span style={{ marginLeft: 8, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
              {formatValue ? formatValue(datum.value) : datum.value}
            </span>
          </div>
        );
      }

      // Summary tooltip showing all slices
      return (
        <div
          style={{
            background: nivoTheme.tooltip.container.background,
            color: nivoTheme.tooltip.container.color,
            padding: 8,
            borderRadius: 6,
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
          }}
        >
          {allPieData.map((d) => (
            <div
              key={d.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                opacity: d.id === String(datum.id) ? 1 : 0.6,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: effectiveColorByKey.get(d.id) ?? '#999999',
                  display: 'inline-block',
                }}
              />
              <span>{d.label ?? d.id}</span>
              <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{formatValue ? formatValue(d.value) : d.value}</span>
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${nivoTheme.grid.line.stroke}`, marginTop: 6, paddingTop: 6, fontWeight: 600 }}>
            Total: {formattedTotal}
          </div>
        </div>
      );
    },
    [summarizeTooltip, allPieData, effectiveColorByKey, formatValue, formattedTotal, nivoTheme],
  );

  // Center layer for donut charts
  const centerLayer = useCallback(
    ({ centerX, centerY }: { centerX: number; centerY: number }) => {
      if (!centerLabel || innerRadius === 0) return null;

      const content = typeof centerLabel === 'function' ? centerLabel({ total, formattedTotal }) : centerLabel;

      return (
        <g transform={`translate(${centerX}, ${centerY})`}>
          {typeof content === 'string' ? (
            <text
              textAnchor="middle"
              dominantBaseline="central"
              style={{ fontSize: 24, fontWeight: 600, fill: nivoTheme.text.fill }}
            >
              {content}
            </text>
          ) : (
            content
          )}
        </g>
      );
    },
    [centerLabel, innerRadius, total, formattedTotal, nivoTheme.text.fill],
  );

  const resolvedArcLabelsTextColor = useMemo(() => {
    if (arcLabelsTextColor) return arcLabelsTextColor;
    return (d: ComputedDatum<PieDatum>) => getContrastingTextColor(d.color);
  }, [arcLabelsTextColor, getContrastingTextColor]);

  const resolvedArcLinkLabelsTextColor = useMemo(() => {
    if (arcLinkLabelsTextColor) return arcLinkLabelsTextColor;
    return { from: 'color', modifiers: [['darker', 1.2]] as [string, number][] };
  }, [arcLinkLabelsTextColor]);

  // Custom legend layer that always shows all items (even when filtered)
  const customLegendLayer = useCallback(
    ({ centerX, centerY, radius }: { centerX: number; centerY: number; radius: number }) => {
      if (!showLegend) return null;

      const itemWidth = 100;
      const itemHeight = 18;
      const itemSpacing = 10;
      const symbolSize = 14;
      const translateY = radius + 56;

      const totalWidth = allSliceIds.length * (itemWidth + itemSpacing) - itemSpacing;
      const startX = centerX - totalWidth / 2;

      return (
        <g transform={`translate(0, ${centerY + translateY})`}>
          {allSliceIds.map((id, i) => {
            const isActive = activeSliceIds.includes(id);
            const isHovered = hoveredLegendKey === id;
            const color = effectiveColorByKey.get(id) ?? '#999999';
            const x = startX + i * (itemWidth + itemSpacing);

            return (
              <g
                key={id}
                transform={`translate(${x}, 0)`}
                style={{ cursor: isLegendInteractive ? 'pointer' : 'default' }}
                onClick={() => isLegendInteractive && toggleSlice(id)}
                onMouseEnter={() => onLegendMouseEnter(id)}
                onMouseLeave={() => onLegendMouseLeave()}
              >
                <circle
                  cx={symbolSize / 2}
                  cy={itemHeight / 2}
                  r={symbolSize / 2}
                  fill={isActive ? color : withAlpha(color, 0.3)}
                />
                <text
                  x={symbolSize + 8}
                  y={itemHeight / 2}
                  dominantBaseline="central"
                  style={{
                    fontSize: 12,
                    fill: nivoTheme.text.fill,
                    opacity: isActive ? (isHovered ? 1 : 0.9) : 0.5,
                    textDecoration: isActive ? 'none' : 'line-through',
                  }}
                >
                  {id}
                </text>
              </g>
            );
          })}
        </g>
      );
    },
    [
      showLegend,
      allSliceIds,
      activeSliceIds,
      hoveredLegendKey,
      effectiveColorByKey,
      isLegendInteractive,
      toggleSlice,
      onLegendMouseEnter,
      onLegendMouseLeave,
      withAlpha,
      nivoTheme.text.fill,
    ],
  );

  const layers = useMemo(() => {
    const baseLayers: any[] = ['arcs', 'arcLabels', 'arcLinkLabels'];
    if (centerLabel && innerRadius > 0) {
      baseLayers.splice(1, 0, centerLayer);
    }
    if (showLegend) {
      baseLayers.push(customLegendLayer);
    }
    return baseLayers;
  }, [centerLabel, innerRadius, centerLayer, showLegend, customLegendLayer]);

  return (
    <div
      className={styles.root}
      style={{ height, width }}
    >
      <ResponsivePie
        data={pieData}
        margin={computedMargin}
        innerRadius={innerRadius}
        padAngle={padAngle}
        cornerRadius={cornerRadius}
        sortByValue={sortByValue}
        colors={(d) => {
          const id = String(d.id);
          const base = effectiveColorByKey.get(id) ?? '#999999';
          if (hoveredLegendKey && id !== hoveredLegendKey) return withAlpha(base, 0.35);
          if (!activeSliceIds.includes(id)) return withAlpha(base, 0.15);
          return base;
        }}
        enableArcLabels={enableArcLabels}
        arcLabel={arcLabel}
        arcLabelsSkipAngle={arcLabelsSkipAngle}
        arcLabelsTextColor={resolvedArcLabelsTextColor as any}
        enableArcLinkLabels={enableArcLinkLabels}
        arcLinkLabel={arcLinkLabel}
        arcLinkLabelsSkipAngle={arcLinkLabelsSkipAngle}
        arcLinkLabelsOffset={arcLinkLabelsOffset}
        arcLinkLabelsDiagonalLength={arcLinkLabelsDiagonalLength}
        arcLinkLabelsStraightLength={arcLinkLabelsStraightLength}
        arcLinkLabelsThickness={arcLinkLabelsThickness}
        arcLinkLabelsColor={arcLinkLabelsColor as any}
        arcLinkLabelsTextColor={resolvedArcLinkLabelsTextColor as any}
        activeOuterRadiusOffset={activeOuterRadiusOffset}
        activeInnerRadiusOffset={activeInnerRadiusOffset}
        valueFormat={formatValue ? (n) => formatValue(n) : undefined}
        theme={nivoTheme}
        tooltip={tooltip}
        layers={layers}
        {...(nivoProps as any)}
      />
    </div>
  );
}
