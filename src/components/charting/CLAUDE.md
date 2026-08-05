# Charting Components Documentation

## Overview

This directory contains reusable charting components built on top of [Nivo](https://nivo.rocks/), a powerful data visualization library for React. Our implementation provides both a simplified API for common use cases and full access to Nivo's extensive customization options.

## Philosophy

1. **Leverage Nivo Features**: We expose native Nivo properties rather than reimplementing functionality
2. **Reusability**: All components are designed to be highly configurable and reusable
3. **Progressive Disclosure**: Simple API for common cases, full Nivo API for advanced needs
4. **Type Safety**: Full TypeScript support with proper type definitions

## Components

### LineChart
A flexible line chart component supporting multiple series, areas, markers, and extensive customization.

**Location**: `LineChart.tsx`

**Key Features**:
- Multiple data series with automatic color assignment
- Area charts with `showArea` prop
- Point labels with customizable positioning
- Crosshair and hover effects
- Interactive legends
- Full marker support

### StackedBarChart
A versatile bar chart supporting both stacked and grouped layouts, horizontal/vertical orientation.

**Location**: `StackedBarChart.tsx`

**Key Features**:
- Stacked or grouped bars via `stacked` prop
- Horizontal/vertical orientation via `horizontal` prop
- Automatic totals display with `showTotals`
- Custom tooltips with summaries
- Interactive legends
- Full marker support

### BaseChart (Shared Utilities)
Core utilities and hooks shared across all chart components.

**Location**: `BaseChart.tsx`

**Key Functions**:
- `inferIndexKey()`: Automatically detects the category/index field
- `inferSeriesKeys()`: Automatically detects numeric series fields
- `useBaseChart()`: Hook providing common chart functionality
- `createNivoLineMarkers()`: Converts markers to Nivo format for line charts
- `createNivoBarMarkers()`: Converts markers to Nivo format for bar charts

## Marker System

Our charts support two marker APIs:

### 1. Simplified API
For quick, common use cases:
```typescript
{
  type: 'line',
  axis: 'value',        // 'value' or 'index'
  value: 100,
  color: '#ef4444',     // Maps to lineStyle.stroke
  width: 2,             // Maps to lineStyle.strokeWidth
  legend: 'Target',
  legendPosition: 'end' // 'start', 'middle', or 'end'
}
```

### 2. Full Nivo API
For complete control over styling and positioning:
```typescript
{
  type: 'line',
  axis: 'y',            // Nivo native: 'x' or 'y'
  value: 100,
  legend: 'Target',
  legendPosition: 'top-right',     // All 9 positions
  legendOrientation: 'horizontal',  // or 'vertical'
  legendOffset: 12,
  legendOffsetX: 10,
  legendOffsetY: -5,
  lineStyle: {
    stroke: '#ef4444',
    strokeWidth: 2,
    strokeDasharray: '5 5',
    strokeOpacity: 0.8
  },
  textStyle: {
    fill: '#991b1b',
    fontSize: 14,
    fontWeight: 'bold',
    fontStyle: 'italic',
    textAnchor: 'middle'
  }
}
```

### Dot Markers
For highlighting specific data points:
```typescript
{
  type: 'dot',
  index: 'January',     // Category on index axis
  value: 85,            // Value on value axis
  color: '#10b981',
  radius: 5,
  title: 'Peak',
  titleOffsetX: 5,
  titleOffsetY: -10
}
```

## Data Format

All charts expect data in this format:
```typescript
type ChartData = Array<{
  [indexKey: string]: string | number | Date;  // Category field
  [seriesKey: string]: number;                 // Numeric fields
}>
```

Example:
```typescript
const data = [
  { month: 'Jan', sales: 120, costs: 80 },
  { month: 'Feb', sales: 150, costs: 90 },
]
```

## Common Props

### BaseChartProps
All charts share these base properties:
- `data`: Array of data points
- `showLegend`: Display legend (default: true)
- `isLegendInteractive`: Allow toggling series (default: true)
- `summarizeTooltip`: Show summary tooltips (default: varies)
- `formatValue`: Function to format numeric values
- `formatIndex`: Function to format category values
- `height`: Chart height (default: 420px)
- `width`: Chart width (default: '100%')
- `markers`: Array of line/dot markers
- `seriesColors`: Custom colors by series key

## Theming

Charts automatically adapt to the application theme using:
- `useChartTheme()`: Provides Nivo theme configuration
- Supports light/dark modes
- Consistent color palettes
- Automatic contrast for text on colored backgrounds

## Implementation Guidelines

### Adding New Features

1. **Check Nivo First**: Before implementing custom logic, check if Nivo provides the feature
2. **Expose Native Props**: Add new Nivo properties to type definitions
3. **Maintain Compatibility**: Keep simplified API working when adding advanced features
4. **Document Properties**: Add JSDoc comments for new props

### Example: Adding a New Nivo Property

1. Update types (`types.ts`):
```typescript
export type LineMarker = {
  // ... existing props
  newNivoProp?: string; // Add new property
}
```

2. Pass through in marker creation (`BaseChart.tsx`):
```typescript
return {
  // ... existing mapping
  newNivoProp: line.newNivoProp,
}
```

3. Test with examples in `page.tsx`

### Best Practices

1. **Prefer Composition**: Build complex charts by composing simple, reusable components
2. **Use Type Guards**: Check property existence to determine API version
3. **Provide Defaults**: Supply sensible defaults for all optional properties
4. **Test Combinations**: Ensure different property combinations work together

## Interactive Features

### Legend Interaction
- Click legend items to toggle series visibility
- Hover for highlighting
- Implemented via `useInteractiveLegend()` hook

### Tooltips
- Custom tooltip components for rich information
- Summary tooltips for stacked charts
- Formatted values with locale support

### Hover Effects
- Crosshair for precise value reading
- Band highlighting for focused areas
- Point highlighting on hover

## Performance Considerations

1. **Memoization**: Chart configurations are memoized to prevent unnecessary re-renders
2. **Data Transformation**: Data is transformed once and cached
3. **Responsive**: Charts use `ResponsiveBar`/`ResponsiveLine` for automatic sizing

## Extending the System

### Adding a New Chart Type

1. Create new component file (e.g., `PieChart.tsx`)
2. Import and use `useBaseChart` for common functionality
3. Define specific props interface extending `BaseChartProps`
4. Implement Nivo chart with proper prop mapping
5. Export from index file

### Adding Custom Markers

1. Define new marker type in `types.ts`
2. Update `ChartMarker` union type
3. Implement rendering in custom layer or marker creation function
4. Add examples to demo page

## Common Patterns

### Multi-Series with Different Scales
Use right axis for percentage/different scale:
```typescript
<LineChart
  showRightAxisAsPercent
  // Series will use appropriate axis
/>
```

### Grouped vs Stacked Bars
Toggle with single prop:
```typescript
<StackedBarChart
  stacked={false}  // Grouped bars
  stacked={true}   // Stacked bars
/>
```

### Custom Formatting
Format values and indices:
```typescript
<LineChart
  formatValue={(n) => `$${n.toLocaleString()}`}
  formatIndex={(d) => new Date(d).toLocaleDateString()}
/>
```

## Troubleshooting

### Markers Not Showing
- Ensure marker value exists in data range
- Check axis property matches chart orientation
- Verify color contrast with background

### Legend Not Interactive
- Check `isLegendInteractive` prop is true
- Ensure series keys are properly detected
- Verify no conflicting event handlers

### Performance Issues
- Reduce data points for large datasets
- Disable animations for frequent updates
- Use simpler curve algorithms

## Future Enhancements

When adding new features:
1. First check if Nivo supports it natively
2. Expose the native property if available
3. Only implement custom logic if truly needed
4. Maintain backward compatibility
5. Document new capabilities here

## Resources

- [Nivo Documentation](https://nivo.rocks/)
- [Nivo Storybook](https://nivo.rocks/storybook/)
- [Nivo GitHub](https://github.com/plouc/nivo)