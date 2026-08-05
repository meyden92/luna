import { ResponsiveLine } from '@nivo/line';
import { useCallback, useMemo, useState } from 'react';
import { type AnyDatum, type BaseChartProps, createLegendConfig, createNivoLineMarkers, useBaseChart } from './BaseChart';
import type { ChartMarker } from './types';

type NivoSerie = { id: string | number; data: Array<{ x: any; y: number | null }> };

export type LineChartProps<T extends AnyDatum = AnyDatum> = BaseChartProps<T> & {
  showArea?: boolean;
  curve?: 'linear' | 'natural' | 'monotoneX' | 'monotoneY' | 'basis' | 'cardinal' | 'catmullRom' | 'step' | 'stepBefore' | 'stepAfter';
  pointSize?: number;
  showRightAxisAsPercent?: boolean;
  formatRightAxis?: (n: number) => string;
  showPointLabels?: boolean;
  pointLabel?: string | ((point: any) => string); // e.g. 'yFormatted' | 'x' | accessor
  pointLabelYOffset?: number;
  pointLabelFontSize?: number;
  pointLabelSeriesOffset?: number;
  xAxisLabel?: string;
  crosshairColor?: string;
  crosshairWidth?: number;
  hoverBandColor?: string;
} & Partial<
    Omit<
      React.ComponentProps<typeof ResponsiveLine>,
      | 'data'
      | 'colors'
      | 'axisBottom'
      | 'axisLeft'
      | 'axisRight'
      | 'margin'
      | 'yScale'
      | 'xScale'
      | 'sliceTooltip'
      | 'legends'
      | 'height'
      | 'width'
      | 'layers'
      | 'markers'
      | 'areaBaselineValue'
    >
  >;

export default function LineChart<T extends AnyDatum = AnyDatum>({
  data,
  showLegend = true,
  isLegendInteractive = true,
  summarizeTooltip = false,
  formatValue,
  formatIndex,
  xTickValues,
  showArea = false,
  curve = 'monotoneX',
  pointSize = 6,
  height = 420,
  width = '100%',
  markers,
  showRightAxisAsPercent = false,
  formatRightAxis,
  showPointLabels = false,
  pointLabel = 'yFormatted',
  pointLabelYOffset = -12,
  pointLabelFontSize,
  pointLabelSeriesOffset = 6,
  xAxisLabel,
  crosshairColor,
  crosshairWidth,
  hoverBandColor,
  seriesColors,
  ...nivoProps
}: LineChartProps<T>) {
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
    colorByKey,
  } = useBaseChart(data, seriesColors);

  const [hoverSliceX, setHoverSliceX] = useState<number | null>(null);
  const [hoverSliceLabel, setHoverSliceLabel] = useState<string | null>(null);

  const transformedData = useMemo<NivoSerie[]>(() => {
    const xValues = data.map((row) => {
      const idxVal = (row as AnyDatum)[indexKey];
      return typeof idxVal === 'string' || idxVal instanceof Date ? idxVal : String(idxVal ?? '');
    });
    return allSeriesKeys.map((seriesKey) => {
      const isActive = activeKeys.includes(seriesKey);
      const seriesPoints = isActive
        ? data.map((row, i) => {
            const rawY = (row as AnyDatum)[seriesKey];
            const y = typeof rawY === 'number' && Number.isFinite(rawY) ? rawY : null;
            const x = xValues[i]!;
            return { x, y } as any;
          })
        : [];
      return { id: seriesKey, data: seriesPoints };
    });
  }, [data, indexKey, allSeriesKeys, activeKeys]);

  const resolvedXTickValues = useMemo(() => xTickValues?.map((value) => (value instanceof Date ? value : String(value))), [xTickValues]);

  const hasVisiblePoints = useMemo(
    () => transformedData.some((s) => (s.data as any[]).some((p: any) => typeof p?.y === 'number' && Number.isFinite(p.y))),
    [transformedData],
  );

  const maxVisibleY = useMemo(() => {
    let maxY = 0;
    for (const serie of transformedData) {
      for (const p of serie.data as any[]) {
        const y = Number(p?.y);
        if (Number.isFinite(y)) maxY = Math.max(maxY, Math.abs(y));
      }
    }
    return maxY > 0 ? maxY : 1;
  }, [transformedData]);

  const nivoMarkers = useMemo(() => createNivoLineMarkers(markers, nivoTheme.text.fill), [markers, nivoTheme.text.fill]);

  const customMarkersLayer = useCallback(
    (layerProps: any) => {
      if (!markers || markers.length === 0) return null;
      if (!hasVisiblePoints) return null;
      const xScale = layerProps.xScale as any;
      const yScale = layerProps.yScale as any;
      return (
        <g>
          {markers
            .filter((m) => m.type === 'dot')
            .map((d) => {
              const dot = d as Extract<ChartMarker, { type: 'dot' }>;
              const r = dot.radius ?? 4;
              const cx = xScale(String(dot.index));
              const cy = yScale(dot.value);
              if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
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
    [markers, hasVisiblePoints, nivoTheme.text.fill],
  );

  const computedMargin = useMemo(() => {
    const base = { top: showLegend ? 32 : 24, right: 24, bottom: showLegend ? 64 : 40, left: 56 };
    if (showRightAxisAsPercent) base.right = Math.max(base.right, 56);
    if (showPointLabels) {
      base.left = Math.max(base.left, 96);
      base.right = Math.max(base.right, 112);
      base.top = Math.max(base.top, 40);
    }
    if (markers && markers.length > 0) base.top = Math.max(base.top, 40);
    return base;
  }, [showLegend, showRightAxisAsPercent, showPointLabels, markers]);

  // Use built-in tooltips: slice tooltips when summarizeTooltip is true, point tooltips otherwise.

  const ResponsiveLineAny = ResponsiveLine as any;
  const themed = useMemo(() => {
    const base = nivoTheme as any;
    return {
      ...base,
      labels: { text: { fill: base.text?.fill, fontSize: pointLabelFontSize ?? 12 } },
      crosshair: {
        line: {
          stroke: crosshairColor ?? base.grid?.line?.stroke ?? '#94a3b8',
          strokeWidth: crosshairWidth ?? 1,
          strokeOpacity: 0.6,
        },
      },
    };
  }, [nivoTheme, pointLabelFontSize, crosshairColor, crosshairWidth]);

  const resolvedPointLabel = showPointLabels ? (pointLabel ? pointLabel : formatValue ? 'yFormatted' : 'y') : undefined;

  const pointLabelAccessor = useMemo(() => {
    if (!resolvedPointLabel) return undefined;
    if (typeof resolvedPointLabel === 'function') return resolvedPointLabel as any;
    if (resolvedPointLabel === 'yFormatted') {
      return (d: any) => String(d.data?.yFormatted ?? d.data?.y ?? '');
    }
    if (resolvedPointLabel === 'y') {
      return (d: any) => String(d.data?.y ?? '');
    }
    if (resolvedPointLabel === 'x') {
      return (d: any) => String(d.data?.xFormatted ?? d.data?.x ?? '');
    }
    return (d: any) => String(d.data?.[resolvedPointLabel] ?? '');
  }, [resolvedPointLabel]);

  const PointLabelComponent = useCallback(
    ({ point, label }: any) => {
      const idx = allSeriesKeys.indexOf(String(point.serieId));
      const offset = (idx - (allSeriesKeys.length - 1) / 2) * pointLabelSeriesOffset;
      const y = point.y + (pointLabelYOffset ?? -12) + offset;
      return (
        <text
          x={point.x}
          y={y}
          textAnchor="middle"
          fill={themed.labels?.text?.fill ?? '#111'}
          fontSize={pointLabelFontSize ?? 12}
        >
          {label}
        </text>
      );
    },
    [allSeriesKeys, pointLabelSeriesOffset, pointLabelYOffset, pointLabelFontSize, themed.labels?.text?.fill],
  );

  const hoverLayer = useCallback(
    (layerProps: any) => {
      const { innerWidth, innerHeight, slices, xScale } = layerProps;
      const x = hoverSliceX;
      const label = hoverSliceLabel;
      return (
        <g>
          <rect
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            onMouseMove={(e: any) => {
              const bounds = e.currentTarget.getBoundingClientRect();
              const localX = e.clientX - bounds.left;
              if (!Array.isArray(slices) || slices.length === 0) return;
              let nearest = slices[0];
              let min = Math.abs((slices[0] as any).x - localX);
              for (const s of slices as any[]) {
                const d = Math.abs(s.x - localX);
                if (d < min) {
                  min = d;
                  nearest = s;
                }
              }
              setHoverSliceX((nearest as any).x);
              const raw = (nearest as any).points?.[0]?.data?.x;
              const formatted = (nearest as any).points?.[0]?.data?.xFormatted ?? raw;
              setHoverSliceLabel(formatIndex ? formatIndex(formatted) : String(formatted));
            }}
            onMouseLeave={() => {
              setHoverSliceX(null);
              setHoverSliceLabel(null);
            }}
          />
          {typeof x === 'number' ? (
            <g>
              {/* Hover band for clearer x focus */}
              {typeof xScale?.bandwidth === 'function' ? (
                <rect
                  x={x - xScale.bandwidth() / 2}
                  y={0}
                  width={xScale.bandwidth()}
                  height={innerHeight}
                  fill={hoverBandColor ?? 'rgba(2,132,199,0.06)'}
                />
              ) : null}
              <line
                x1={x}
                x2={x}
                y1={0}
                y2={innerHeight}
                stroke={crosshairColor ?? themed.crosshair?.line?.stroke ?? '#94a3b8'}
                strokeWidth={crosshairWidth ?? themed.crosshair?.line?.strokeWidth ?? 1}
                strokeDasharray="4 4"
              />
              {label ? (
                <g transform={`translate(${x}, ${innerHeight - 2})`}>
                  <rect
                    x={-30}
                    y={-18}
                    width={60}
                    height={18}
                    fill={themed.tooltip?.container?.background ?? '#fff'}
                    rx={3}
                    ry={3}
                  />
                  <text
                    x={0}
                    y={-5}
                    textAnchor="middle"
                    fill={themed.text?.fill ?? '#111'}
                    fontSize={12}
                  >
                    {label}
                  </text>
                </g>
              ) : null}
            </g>
          ) : null}
        </g>
      );
    },
    [hoverSliceX, hoverSliceLabel, themed, formatIndex, crosshairColor, crosshairWidth, hoverBandColor],
  );

  return (
    <div
      className="relative"
      style={{ height, width }}
    >
      <ResponsiveLineAny
        data={transformedData}
        colors={({ id }: { id: string | number }) => {
          const key = String(id);
          const base = colorByKey.get(key) ?? '#999999';
          if (hoveredLegendKey && key !== hoveredLegendKey) return withAlpha(base, 0.35);
          if (!activeKeys.includes(key)) return withAlpha(base, 0.15);
          return base;
        }}
        margin={computedMargin}
        xScale={{ type: 'point' }}
        yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
        axisBottom={{
          tickSize: 0,
          tickPadding: 10,
          tickValues: resolvedXTickValues,
          format: (v: any) => (formatIndex ? formatIndex(v as any) : String(v)),
          legend: xAxisLabel,
          legendOffset: 36,
          legendPosition: 'end',
        }}
        axisLeft={{
          tickSize: 0,
          tickPadding: 12,
          format: (v: any) => {
            const n = Number(v);
            return Number.isFinite(n) && formatValue ? formatValue(n) : String(v);
          },
        }}
        axisRight={
          showRightAxisAsPercent
            ? {
                tickSize: 0,
                tickPadding: 12,
                format: (v: any) => {
                  const n = Number(v);
                  const pct = (n / maxVisibleY) * 100;
                  const val = Number.isFinite(pct) ? pct : 0;
                  return formatRightAxis ? formatRightAxis(val) : `${Math.round(val)}%`;
                },
              }
            : undefined
        }
        enableGridX={false}
        curve={curve as any}
        enablePoints
        pointSize={pointSize}
        enableArea={showArea}
        areaBaselineValue={0}
        theme={themed}
        useMesh={true}
        enableCrosshair={true}
        crosshairType="x"
        enableSlices={summarizeTooltip ? 'x' : false}
        xFormat={formatIndex ? (v: any) => formatIndex(v as any) : undefined}
        yFormat={formatValue ? (v: any) => (typeof v === 'number' ? formatValue(v) : String(v)) : undefined}
        enablePointLabel={Boolean(resolvedPointLabel)}
        enablePointsLabel={Boolean(resolvedPointLabel)}
        pointLabel={pointLabelAccessor}
        pointLabelYOffset={pointLabelYOffset}
        pointLabelComponent={PointLabelComponent as any}
        legends={createLegendConfig(showLegend, isLegendInteractive, activeKeys, toggleKey, onLegendMouseEnter, onLegendMouseLeave)}
        markers={nivoMarkers as any}
        layers={
          [
            'grid',
            'markers',
            'axes',
            'areas',
            'crosshair',
            'lines',
            hoverLayer as any,
            'points',
            'slices',
            customMarkersLayer as any,
            'mesh',
            'legends',
          ] as any
        }
        {...(nivoProps as any)}
      />
    </div>
  );
}
