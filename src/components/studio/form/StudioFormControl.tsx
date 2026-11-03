import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { FormItem, StudioFormValue } from '@/libs/studio/form';
import { sameValue } from '@/libs/studio/request';
import { FileInput } from './FileInput';
import styles from './StudioForm.module.css';

export interface StudioFormControlProps {
  item: FormItem;
  /** Undefined while empty. */
  value: StudioFormValue | undefined;
  onChange: (value: StudioFormValue | undefined) => void;
  /** Ties the control to its `<label htmlFor>`. */
  id: string;
  disabled?: boolean;
}

/**
 * The input for one form item, without its label: what `StudioForm` renders
 * per item, and the value editor of the admin's Field cards.
 */
export function StudioFormControl({ item, value, onChange, id, disabled }: StudioFormControlProps) {
  const options = item.options ?? [];
  const selectedIndex = options.findIndex((option) => sameValue(option.value, value));

  switch (item.control) {
    case 'textarea':
      return (
        <Textarea
          id={id}
          value={typeof value === 'string' ? value : ''}
          maxLength={item.maxLength}
          placeholder={item.placeholder}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value || undefined)}
        />
      );
    case 'number':
      return (
        <Input
          id={id}
          type="number"
          value={typeof value === 'number' ? value : ''}
          min={item.min}
          max={item.max}
          step={item.step ?? 'any'}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
        />
      );
    case 'slider': {
      const current = typeof value === 'number' ? value : (item.min ?? 0);
      return (
        <div className={styles.slider}>
          <Slider
            id={id}
            value={[current]}
            min={item.min}
            max={item.max}
            step={item.step}
            disabled={disabled}
            thumbAriaLabel={item.label}
            onValueChange={(next) => onChange(Array.isArray(next) ? next[0] : next)}
          />
          <output className={styles.sliderValue}>{current}</output>
        </div>
      );
    }
    case 'chips':
      return (
        <Segmented
          id={id}
          label={item.label}
          items={options.map((option, index) => ({ value: String(index), label: option.label }))}
          value={String(selectedIndex)}
          onValueChange={(index) => onChange(options[Number(index)]?.value)}
        />
      );
    case 'select':
      return (
        <Select
          items={options.map((option, index) => ({ value: String(index), label: option.label }))}
          value={selectedIndex === -1 ? null : String(selectedIndex)}
          disabled={disabled}
          onValueChange={(index) => onChange(index === null ? undefined : options[Number(index)]?.value)}
        >
          <SelectTrigger
            id={id}
            className={styles.select}
          >
            <SelectValue placeholder="Choose…" />
          </SelectTrigger>
          <SelectContent>
            {options.map((option, index) => (
              <SelectItem
                key={option.label}
                value={String(index)}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'multi': {
      const selected = Array.isArray(value) ? value : [];
      return (
        <ToggleGroup
          id={id}
          aria-label={item.label}
          multiple
          variant="outline"
          value={options.flatMap((option, index) => (selected.some((entry) => sameValue(entry, option.value)) ? [String(index)] : []))}
          onValueChange={(indices: string[]) => onChange(indices.map((index) => options[Number(index)]?.value ?? null))}
        >
          {options.map((option, index) => (
            <ToggleGroupItem
              key={option.label}
              value={String(index)}
            >
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      );
    }
    case 'switch':
      return (
        <Switch
          id={id}
          checked={value === true}
          disabled={disabled}
          onCheckedChange={(checked) => onChange(checked)}
        />
      );
    case 'file':
      return (
        <FileInput
          id={id}
          item={item}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    default:
      return (
        <Input
          id={id}
          value={typeof value === 'string' ? value : ''}
          maxLength={item.maxLength}
          placeholder={item.placeholder}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value || undefined)}
        />
      );
  }
}
