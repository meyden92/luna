import type { BarDatum, BarSvgProps } from '@nivo/bar';
import { ResponsiveBar } from '@nivo/bar';
import { useCallback, useMemo } from 'react';
import { type AnyDatum, type BaseChartProps, createNivoBarMarkers, useBaseChart } from './BaseChart';
import styles from './StackedBarChart.module.css';
import type { ChartMarker } from './types';

type NivoOverrides = Omit<
  BarSvgProps<BarDatum>,
  'data' | 'keys' | 'indexBy' | 'groupMode' | 'colors' | 'legends' | 'tooltip' | 'barComponent' | 'width' | 'height' | 'layout' | 'markers'
>;

export type StackedBarChartProps<T extends AnyDatum = AnyDatum> = BaseChartProps<T> & {
  stacked?: boolean;
  showTotals?: boolean;
  horizontal?: boolean;
} & Partial<NivoOverrides>;

export default function StackedBarChart<T extends AnyDatum = AnyDatum>({
  data,
  stacked = true,
  showLegend = true,
  isLegendInteractive = true,
  summarizeTooltip = true,
  formatValue,
  formatIndex,
  xTickValues,
  showTotals = false,
  horizontal = false,
  height = 420,
  width = '100%',
  markers,
  seriesColors,
  ...nivoProps
}: StackedBarChartProps<T>) {
  const {
    indexKey,
    allSeriesKeys,
    activeKeys,
    toggleKey,
    hoveredLegendKey,
    onLegendMouseEnter,
    onLegendMouseLeave,
    withAlpha,
    nivoTheme,
    getContrastingTextColor,
    colorByKey,
  } = useBaseChart(data, seriesColors);

  const tooltip = useCallback(
    (bar: any) => {
      if (!(stacked && summarizeTooltip)) return null;
      const idxValue = bar.indexValue as string | number | Date;
      const row = data.find((r) => String((r as AnyDatum)[indexKey]) === String(idxValue)) as AnyDatum | undefined;
      if (!row) return null;
      const entries = allSeriesKeys
        .filter((k) => activeKeys.includes(k))
        .map((k) => ({ key: k, value: Number(row[k] ?? 0), color: colorByKey.get(k) ?? '#999999' }));
      const total = entries.reduce((sum, e) => sum + (Number.isFinite(e.value) ? e.value : 0), 0);
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
          {entries.map((e) => (
            <div
              key={e.key}
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: e.color,
                  display: 'inline-block',
                }}
              />
              <span>{e.key}</span>
              <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{formatValue ? formatValue(e.value) : e.value}</span>
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${nivoTheme.grid.line.stroke}`, marginTop: 6, paddingTop: 6, fontWeight: 600 }}>
            Total: {formatValue ? formatValue(total) : total}
          </div>
        </div>
      );
    },
    [
      stacked,
      summarizeTooltip,
      data,
      indexKey,
      allSeriesKeys,
      activeKeys,
      colorByKey,
      nivoTheme.tooltip.container.background,
      nivoTheme.tooltip.container.color,
      nivoTheme.grid.line.stroke,
      formatValue,
    ],
  );

  // Use Nivo's default tooltip when not summarizing

  type NivoBarDatum = { [key: string]: string | number };

  const transformedData = useMemo<NivoBarDatum[]>(() => {
    return data.map((row) => {
      const obj: NivoBarDatum = {};
      const idxVal = (row as AnyDatum)[indexKey];
      obj[indexKey] = typeof idxVal === 'string' ? idxVal : String(idxVal ?? '');
      for (const k of allSeriesKeys) {
        const raw = (row as AnyDatum)[k];
        const numeric = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
        obj[k] = activeKeys.includes(k) ? numeric : 0;
      }
      return obj;
    });
  }, [data, indexKey, allSeriesKeys, activeKeys]);

  const nivoMarkers = useMemo(
    () => createNivoBarMarkers(markers, horizontal, nivoTheme.text.fill),
    [markers, horizontal, nivoTheme.text.fill],
  );

  const resolvedXTickValues = useMemo(() => xTickValues?.map((value) => (value instanceof Date ? value : String(value))), [xTickValues]);

  const customMarkersLayer = useCallback(
    (layerProps: any) => {
      if (!markers || markers.length === 0) return null;
      const xScale = layerProps.xScale as any;
      const yScale = layerProps.yScale as any;
      const bandSize = (scale: any) => (typeof scale.bandwidth === 'function' ? scale.bandwidth() : 0);

      return (
        <g>
          {markers
            .filter((m) => m.type === 'dot')
            .map((d) => {
              const dot = d as Extract<ChartMarker, { type: 'dot' }>;
              const r = dot.radius ?? 4;
              let cx = 0;
              let cy = 0;
              if (!horizontal) {
                const x0 = xScale(String(dot.index));
                cx = (x0 ?? 0) + bandSize(xScale) / 2;
                cy = yScale(dot.value);
              } else {
                cx = xScale(dot.value);
                const y0 = yScale(String(dot.index));
                cy = (y0 ?? 0) + bandSize(yScale) / 2;
              }
              const fill = dot.color ?? '#ef4444';
              return (
                <g key={`dot-${String(dot.index)}-${dot.value}`}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={fill}
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                  {dot.title ? (
                    <text
                      x={cx + (dot.titleOffsetX ?? 8)}
                      y={cy - (r + 6) + (dot.titleOffsetY ?? 0)}
                      fontSize={12}
                      fill={nivoTheme.text.fill}
                    >
                      {dot.title}
                    </text>
                  ) : null}
                </g>
              );
            })}
        </g>
      );
    },
    [markers, horizontal, nivoTheme.text.fill],
  );

  const computedMargin = useMemo(() => {
    const base = { top: showLegend ? 32 : 24, right: 24, bottom: showLegend ? 80 : 40, left: 56 };
    if (horizontal) {
      base.left = Math.max(base.left, 120);
      base.right = Math.max(base.right, 32);
      base.top = Math.max(base.top, 32);
      base.bottom = Math.max(base.bottom, 40);
    }
    if (showTotals) base.top = Math.max(base.top, 40);
    if (markers && markers.length > 0) base.top = Math.max(base.top, 40);
    return base;
  }, [showLegend, horizontal, showTotals, markers]);

  return (
    <div
      className={styles.root}
      style={{ height, width }}
    >
      <ResponsiveBar
        data={transformedData}
        keys={allSeriesKeys}
        indexBy={indexKey}
        margin={computedMargin}
        padding={0.3}
        valueScale={{ type: 'linear' }}
        indexScale={{ type: 'band', round: true }}
        layout={horizontal ? 'horizontal' : 'vertical'}
        enableLabel
        label={(d) => (formatValue ? formatValue(Number(d.value ?? 0)) : String(d.value ?? 0))}
        labelTextColor={(d) => getContrastingTextColor(d.color)}
        valueFormat={formatValue ? (n) => formatValue(n) : undefined}
        colors={({ id }) => {
          const key = String(id);
          const base = colorByKey.get(key) ?? '#999999';
          if (hoveredLegendKey && key !== hoveredLegendKey) return withAlpha(base, 0.35);
          return base;
        }}
        borderColor={{ from: 'color', modifiers: [['darker', 0.4]] }}
        enableGridX={false}
        axisTop={null}
        axisRight={null}
        axisBottom={{
          tickSize: 0,
          tickPadding: 10,
          tickRotation: 0,
          tickValues: resolvedXTickValues,
          format: (v) => {
            const val = v as string | number | Date;
            return formatIndex ? formatIndex(val) : String(val);
          },
          legend: horizontal ? (formatIndex ? formatIndex('') : '') : undefined,
          legendPosition: 'end',
          legendOffset: 36,
        }}
        axisLeft={{
          tickSize: 0,
          tickPadding: 12,
          tickRotation: 0,
          format: (v) => {
            const n = Number(v);
            return Number.isFinite(n) && formatValue ? formatValue(n) : String(v);
          },
          legend: horizontal ? undefined : formatValue ? formatValue(0) && '' : '',
          legendPosition: 'end',
          legendOffset: -40,
        }}
        labelSkipWidth={16}
        labelSkipHeight={16}
        legends={
          showLegend
            ? [
                {
                  dataFrom: 'keys' as const,
                  anchor: 'bottom' as const,
                  direction: 'row' as const,
                  justify: false,
                  translateX: 0,
                  translateY: 56,
                  itemsSpacing: 10,
                  itemWidth: 100,
                  itemHeight: 18,
                  itemDirection: 'left-to-right' as const,
                  itemOpacity: 0.9,
                  symbolSize: 14,
                  symbolShape: 'circle' as const,
                  onClick: isLegendInteractive
                    ? (d: any) => {
                        const id = String(d.id);
                        toggleKey(id);
                      }
                    : undefined,
                  onMouseEnter: (d: any) => {
                    const id = String(d.id);
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
              ]
            : undefined
        }
        groupMode={stacked ? 'stacked' : 'grouped'}
        role="application"
        theme={nivoTheme}
        tooltip={stacked && summarizeTooltip ? tooltip : undefined}
        enableTotals={stacked && showTotals}
        markers={nivoMarkers as any}
        layers={['grid', 'axes', 'bars', customMarkersLayer, 'markers', 'legends', 'annotations'] as any}
        {...nivoProps}
      />
    </div>
  );
}
