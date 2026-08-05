// Official Nivo CartesianMarker properties
export type LineMarker = {
  type: 'line';
  axis?: 'x' | 'y'; // Nivo uses x/y directly, we'll map from value/index
  value: number | string | Date;
  legend?: string;
  legendPosition?: 'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right';
  legendOrientation?: 'horizontal' | 'vertical';
  legendOffset?: number;
  legendOffsetX?: number;
  legendOffsetY?: number;
  lineStyle?: {
    stroke?: string;
    strokeWidth?: number;
    strokeDasharray?: string;
    strokeDashoffset?: number;
    strokeOpacity?: number;
  };
  textStyle?: {
    fill?: string;
    fontSize?: number | string;
    fontFamily?: string;
    fontWeight?: number | string;
    fontStyle?: string;
    textAnchor?: 'start' | 'middle' | 'end';
    alignmentBaseline?: string;
  };
};

// For simplified API, we'll also support these aliases
export type SimpleLineMarker = {
  type: 'line';
  axis?: 'value' | 'index'; // Will be mapped to x/y
  value: number | string | Date;
  color?: string; // Will be mapped to lineStyle.stroke
  width?: number; // Will be mapped to lineStyle.strokeWidth
  legend?: string;
  legendPosition?: 'start' | 'middle' | 'end'; // Will be mapped to Nivo positions
  legendOffset?: number;
};

export type DotMarker = {
  type: 'dot';
  index: string | number; // category on the index axis
  value: number; // numeric value on the value axis
  color?: string;
  radius?: number;
  title?: string;
  titleOffsetX?: number;
  titleOffsetY?: number;
};

export type ChartMarker = LineMarker | SimpleLineMarker | DotMarker;
