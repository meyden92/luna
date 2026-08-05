import { Slider as SliderPrimitive } from '@base-ui/react/slider';
import * as React from 'react';

import { cn } from '@/libs/utils';

type SliderProps = SliderPrimitive.Root.Props & {
  thumbAriaLabel?: string;
  getThumbAriaValueText?: (value: number) => string;
};

function Slider({ className, defaultValue, value, min = 0, max = 100, thumbAriaLabel, getThumbAriaValueText, ...props }: SliderProps) {
  const _values = React.useMemo(
    () => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max]),
    [value, defaultValue, min, max],
  );

  return (
    <SliderPrimitive.Root
      className="data-horizontal:w-full data-vertical:h-full"
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control
        className={cn(
          'data-vertical:min-h-40 relative flex w-full touch-none items-center py-1 select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:w-auto data-vertical:flex-col',
          className,
        )}
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative h-2.5 w-full bg-border/85 dark:bg-base-700 border-border dark:border-base-600 rounded-lg border overflow-hidden shadow-inner select-none data-vertical:h-full data-vertical:w-2.5"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="h-full bg-gradient-to-r from-primary-800 via-primary-600 to-primary-400 shadow-sm select-none data-vertical:h-auto data-vertical:w-full"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            // biome-ignore lint/suspicious/noArrayIndexKey: <fine>
            key={index}
            index={index}
            getAriaLabel={thumbAriaLabel ? () => thumbAriaLabel : undefined}
            getAriaValueText={getThumbAriaValueText ? (_formattedValue, value) => getThumbAriaValueText(value) : undefined}
            className="border-primary-300 dark:border-primary-500 ring-primary/20 size-5 rounded-full border-2 bg-background shadow-md transition-[box-shadow,transform,border-color] duration-200 hover:scale-110 hover:shadow-lg focus-visible:scale-110 focus-visible:ring-4 focus-visible:ring-ring/45 focus-visible:outline-hidden block shrink-0 select-none disabled:pointer-events-none disabled:opacity-50"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
