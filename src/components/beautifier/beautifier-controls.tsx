import { Grid2X2, ImageIcon, type LucideIcon, Palette, RotateCcw, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { formatSize } from '@/libs/utils';
import type {
  BeautifierBackgroundStyle,
  BeautifierConfig,
  BeautifierConfigUpdate,
  BeautifierSourceFile,
} from '@/schemas/beautifier-schema';
import styles from './beautifier-controls.module.css';

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
    <div className="stack space-2">
      <Label
        htmlFor={id}
        className={styles.fieldLabel}
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
    <div className="stack space-2">
      <div className={styles.sliderHead}>
        <Label className={styles.fieldLabel}>{label}</Label>
        <span className={styles.sliderValue}>
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
    <div className="cluster space-2">
      <Icon
        className={styles.sectionIcon}
        aria-hidden
      />
      <h2 className={styles.sectionTitle}>{title}</h2>
    </div>
  );
}

export function BeautifierControls({ source, config, onConfigChange, onReset }: BeautifierControlsProps) {
  const sourceDimensions = source.width && source.height ? `${source.width} x ${source.height}` : 'Dimensions pending';

  return (
    <aside className={styles.panel}>
      <div className="stack space-2">
        <div className={styles.sourceHead}>
          <div className={styles.sourceIdentity}>
            <p className={styles.sourceLabel}>Source</p>
            <h1 className={styles.sourceTitle}>{source.title || 'Untitled image'}</h1>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            title="Reset settings"
            aria-label="Reset settings"
            onClick={onReset}
          >
            <RotateCcw className={styles.resetIcon} />
          </Button>
        </div>
        <div className={styles.chips}>
          <span className={styles.chip}>{source.contentType}</span>
          <span className={styles.chip}>{formatSize(source.size, { trim: true })}</span>
          <span className={styles.chip}>{sourceDimensions}</span>
        </div>
      </div>

      <Separator />

      <section className="stack">
        <SectionHeader
          icon={Square}
          title="Canvas"
        />
        <div className={styles.optionGrid}>
          {SIZE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={styles.optionButton}
              data-active={(config.width === preset.width && config.height === preset.height) || undefined}
              onClick={() => onConfigChange({ width: preset.width, height: preset.height })}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className={styles.sizeGrid}>
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

      <section className="stack">
        <SectionHeader
          icon={Palette}
          title="Background"
        />
        <div className={styles.colorRow}>
          <Input
            aria-label="Background color"
            type="color"
            value={config.backgroundColor}
            className={styles.colorInput}
            onChange={(event) => onConfigChange({ backgroundColor: event.target.value })}
          />
          <HexField
            label="Background color hex"
            value={config.backgroundColor}
            onCommit={(backgroundColor) => onConfigChange({ backgroundColor })}
          />
        </div>
        <div className={styles.optionGrid}>
          {BACKGROUNDS.map((background) => (
            <button
              key={background.value}
              type="button"
              className={styles.optionButton}
              data-active={config.backgroundStyle === background.value || undefined}
              onClick={() => onConfigChange({ backgroundStyle: background.value })}
            >
              <Grid2X2 className={styles.optionIcon} />
              {background.label}
            </button>
          ))}
        </div>
      </section>

      <Separator />

      <section className="stack">
        <SectionHeader
          icon={ImageIcon}
          title="Frame"
        />
        <div className={styles.colorRow}>
          <Input
            aria-label="Frame color"
            type="color"
            value={config.frameColor}
            className={styles.colorInput}
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
