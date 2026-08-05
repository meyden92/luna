import { Grid2X2, ImageIcon, type LucideIcon, Palette, RotateCcw, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { cn, formatSize } from '@/libs/utils';
import type {
  BeautifierBackgroundStyle,
  BeautifierConfig,
  BeautifierConfigUpdate,
  BeautifierSourceFile,
} from '@/schemas/beautifier-schema';

interface BeautifierControlsProps {
  source: BeautifierSourceFile;
  config: BeautifierConfig;
  onConfigChange: (updates: BeautifierConfigUpdate) => void;
  onReset: () => void;
}

const BACKGROUNDS: Array<{ value: BeautifierBackgroundStyle; label: string }> = [
  { value: 'soft-grid', label: 'Grid' },
  { value: 'solid', label: 'Solid' },
  { value: 'checker', label: 'Check' },
];

const SIZE_PRESETS = [
  { label: 'Landscape', width: 1600, height: 1200 },
  { label: 'Square', width: 1400, height: 1400 },
  { label: 'Story', width: 1080, height: 1920 },
];

function NumberField({
  id,
  label,
  value,
  min,
  max,
  onCommit,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label
        htmlFor={id}
        className="text-[12px] text-luna-ink-3"
      >
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (!Number.isNaN(next) && next >= min && next <= max) onCommit(next);
        }}
      />
    </div>
  );
}

const HEX_COLOR = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

function HexField({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  // Re-sync when the committed value changes elsewhere (color picker, reset).
  useEffect(() => setDraft(value), [value]);

  return (
    <Input
      aria-label={label}
      value={draft}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        if (HEX_COLOR.test(next)) onCommit(next);
      }}
      onBlur={() => setDraft(value)}
    />
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = 'px',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-[12px] text-luna-ink-3">{label}</Label>
        <span className="font-mono text-[11px] text-luna-ink-4">
          {value}
          {suffix}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        thumbAriaLabel={label}
        onValueChange={(nextValue) => {
          const next = Array.isArray(nextValue) ? nextValue[0] : nextValue;
          if (typeof next === 'number') onChange(next);
        }}
      />
    </div>
  );
}

function SectionHeader({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon
        className="h-4 w-4 text-luna-accent-2"
        aria-hidden
      />
      <h2 className="text-[13px] font-semibold text-luna-ink">{title}</h2>
    </div>
  );
}

export function BeautifierControls({ source, config, onConfigChange, onReset }: BeautifierControlsProps) {
  const sourceDimensions = source.width && source.height ? `${source.width} x ${source.height}` : 'Dimensions pending';

  return (
    <aside className="flex h-full flex-col gap-4 rounded-[12px] border border-luna-line bg-luna-bg p-4 shadow-[var(--luna-shadow-sm)]">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-luna-ink-4">Source</p>
            <h1 className="mt-1 truncate font-serif text-[30px] font-normal leading-none text-luna-ink">
              {source.title || 'Untitled image'}
            </h1>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            title="Reset settings"
            aria-label="Reset settings"
            onClick={onReset}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 font-mono text-[10.5px] text-luna-ink-4">
          <span className="rounded-md border border-luna-line bg-luna-bg-2 px-2 py-1">{source.contentType}</span>
          <span className="rounded-md border border-luna-line bg-luna-bg-2 px-2 py-1">{formatSize(source.size, { trim: true })}</span>
          <span className="rounded-md border border-luna-line bg-luna-bg-2 px-2 py-1">{sourceDimensions}</span>
        </div>
      </div>

      <Separator />

      <section className="space-y-4">
        <SectionHeader
          icon={Square}
          title="Canvas"
        />
        <div className="grid grid-cols-3 gap-2">
          {SIZE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={cn(
                'h-8 rounded-lg border px-2 text-[12px] font-medium transition-colors',
                config.width === preset.width && config.height === preset.height
                  ? 'border-luna-accent bg-luna-accent-soft text-luna-accent-2'
                  : 'border-luna-line bg-luna-bg-2 text-luna-ink-3 hover:border-luna-line-2 hover:text-luna-ink',
              )}
              onClick={() => onConfigChange({ width: preset.width, height: preset.height })}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            id="beautifier-width"
            label="Width"
            value={config.width}
            min={640}
            max={3840}
            onCommit={(width) => onConfigChange({ width })}
          />
          <NumberField
            id="beautifier-height"
            label="Height"
            value={config.height}
            min={640}
            max={3840}
            onCommit={(height) => onConfigChange({ height })}
          />
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <SectionHeader
          icon={Palette}
          title="Background"
        />
        <div className="grid grid-cols-[3.25rem_1fr] gap-2">
          <Input
            aria-label="Background color"
            type="color"
            value={config.backgroundColor}
            className="h-9 p-1"
            onChange={(event) => onConfigChange({ backgroundColor: event.target.value })}
          />
          <HexField
            label="Background color hex"
            value={config.backgroundColor}
            onCommit={(backgroundColor) => onConfigChange({ backgroundColor })}
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {BACKGROUNDS.map((background) => (
            <button
              key={background.value}
              type="button"
              className={cn(
                'flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2 text-[12px] font-medium transition-colors',
                config.backgroundStyle === background.value
                  ? 'border-luna-accent bg-luna-accent-soft text-luna-accent-2'
                  : 'border-luna-line bg-luna-bg-2 text-luna-ink-3 hover:border-luna-line-2 hover:text-luna-ink',
              )}
              onClick={() => onConfigChange({ backgroundStyle: background.value })}
            >
              <Grid2X2 className="h-3 w-3" />
              {background.label}
            </button>
          ))}
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <SectionHeader
          icon={ImageIcon}
          title="Frame"
        />
        <div className="grid grid-cols-[3.25rem_1fr] gap-2">
          <Input
            aria-label="Frame color"
            type="color"
            value={config.frameColor}
            className="h-9 p-1"
            onChange={(event) => onConfigChange({ frameColor: event.target.value })}
          />
          <HexField
            label="Frame color hex"
            value={config.frameColor}
            onCommit={(frameColor) => onConfigChange({ frameColor })}
          />
        </div>
        <SliderField
          label="Padding"
          value={config.padding}
          min={32}
          max={420}
          onChange={(padding) => onConfigChange({ padding })}
        />
        <SliderField
          label="Frame"
          value={config.frameWidth}
          min={0}
          max={80}
          onChange={(frameWidth) => onConfigChange({ frameWidth })}
        />
        <SliderField
          label="Corners"
          value={config.imageRadius}
          min={0}
          max={160}
          onChange={(imageRadius) => onConfigChange({ imageRadius })}
        />
        <SliderField
          label="Shadow"
          value={config.shadowStrength}
          min={0}
          max={100}
          suffix="%"
          onChange={(shadowStrength) => onConfigChange({ shadowStrength })}
        />
        <SliderField
          label="Tilt"
          value={config.rotation}
          min={-8}
          max={8}
          step={0.5}
          suffix="deg"
          onChange={(rotation) => onConfigChange({ rotation })}
        />
      </section>
    </aside>
  );
}
