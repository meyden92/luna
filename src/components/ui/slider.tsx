import { Slider as SliderPrimitive } from '@base-ui/react/slider';
import * as React from 'react';

import { cn } from '@/libs/utils';
import styles from './slider.module.css';

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
      className={styles.root}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className={cn(styles.control, className)}>
        <SliderPrimitive.Track
          data-slot="slider-track"
          className={styles.track}
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className={styles.indicator}
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
            className={styles.thumb}
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
