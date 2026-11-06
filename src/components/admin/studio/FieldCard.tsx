import { type ReactNode, useId } from 'react';
import { StudioFormControl } from '@/components/studio/form/StudioFormControl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Segmented } from '@/components/ui/segmented';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { JsonValue } from '@/db/schema/json';
import { buildStudioForm } from '@/libs/studio/form';
import { canTakeFiles, DISPLAYS, enumerableValues, fieldKind, propertyShape, suggestAccept } from '@/libs/studio/model-config';
import { sameValue } from '@/libs/studio/request';
import { type FieldConfig, type FieldMode, type JsonSchema, MEDIA_KINDS, type MediaKind, type VisibleIf } from '@/libs/studio/types';
import styles from './FieldCard.module.css';

/** The three ways to set up a Field, each with the line that explains it under the choice. */
const MODES: { value: FieldMode; label: string; help: string }[] = [
  { value: 'shown', label: 'User input', help: 'Users fill this in on the Studio form.' },
  { value: 'fixed', label: 'Fixed value', help: 'Always sent with the value below. Users do not see it.' },
  { value: 'default', label: 'fal default', help: 'Not sent: fal uses its own default. Users do not see it.' },
];

export const MEDIA_LABELS: Record<MediaKind, string> = { image: 'Images', video: 'Videos', audio: 'Audio', model3d: '3D models' };

const KIND_LABELS: Record<string, string> = {
  string: 'text',
  enum: 'choice',
  integer: 'integer',
  number: 'number',
  boolean: 'on/off',
  file: 'file',
  files: 'files',
  list: 'list',
  object: 'object',
};

export interface FieldCardProps {
  field: FieldConfig;
  schema: JsonSchema;
  /** All of the Model's Fields, for the `visibleIf` choices and group suggestions. */
  fields: FieldConfig[];
  issues: string[];
  onChange: (field: FieldConfig) => void;
  /** The drag handle from `SortableList`. */
  handle: ReactNode;
  /** A Template's Variables, which `visibleIf` may name too. */
  variableCandidates?: VisibleIfCandidate[];
  /** Replaces the value editor, e.g. the Template editor's text editor. */
  valueEditor?: ReactNode;
  /** The Template's file Variables that feed this input: they own it, so the card offers no mode or settings. */
  filledBy?: string[];
}

/** A Field or Variable that `visibleIf` can depend on, with the values it can take. */
export interface VisibleIfCandidate {
  name: string;
  values: { value: JsonValue; label: string }[];
}

/** The Fields with finitely many values, as `visibleIf` candidates for any Field or Variable but `exclude`. */
export function fieldCandidates(fields: FieldConfig[], schema: JsonSchema, exclude?: string): VisibleIfCandidate[] {
  const properties = schema.properties ?? {};
  return fields.flatMap((field) => {
    const property = properties[field.name];
    const values = field.name === exclude || !property ? null : enumerableValues(field, property);
    if (!values) return [];
    const labelOf = (value: JsonValue) =>
      field.options?.find((option) => option.value === value)?.label ||
      (typeof value === 'boolean' ? (value ? 'On' : 'Off') : String(value));
    return [{ name: field.name, values: values.map((value) => ({ value, label: labelOf(value) })) }];
  });
}

/**
 * Configures one schema property of a Model: mode, label, help, value,
 * range, options, display, accepted media, group and conditional visibility.
 * A Field left at fal's default, or fed by a file Variable, collapses to one line.
 */
export function FieldCard({
  field,
  schema,
  fields,
  issues,
  onChange,
  handle,
  variableCandidates = [],
  valueEditor,
  filledBy = [],
}: FieldCardProps) {
  const id = useId();
  const property = schema.properties?.[field.name] ?? {};
  const shape = propertyShape(field.name, property);
  const kind = fieldKind(field, property);
  const isFile = kind === 'file' || kind === 'files';
  const canBeFile = canTakeFiles(shape.kind);
  const required = schema.required?.includes(field.name) ?? false;
  const set = (change: Partial<FieldConfig>) => onChange(withoutUndefined({ ...field, ...change }));
  const isFed = filledBy.length > 0;

  const setMode = (mode: FieldMode) => {
    const value = mode === 'fixed' && field.value === undefined ? shape.default : field.value;
    set({ mode, value });
  };

  return (
    <section
      aria-label={`Field ${field.name}`}
      className={styles.card}
      data-mode={isFed ? 'default' : field.mode}
    >
      <div className={styles.head}>
        {handle}
        <span className={styles.name}>{field.name}</span>
        <span className={styles.kind}>{KIND_LABELS[kind]}</span>
        {required && <Badge variant="outline">required</Badge>}
        {!isFed && (
          <Segmented
            className={styles.mode}
            label={`Mode of ${field.name}`}
            value={field.mode}
            onValueChange={setMode}
            items={MODES.map(({ value, label }) => ({
              value,
              label,
              disabled: (value === 'fixed' && isFile) || (value === 'shown' && DISPLAYS[kind].length === 0),
            }))}
          />
        )}
      </div>

      <p className={styles.note}>
        {isFed
          ? `Users fill this in through the file input ${filledBy.map((name) => `{${name}}`).join(', ')}.`
          : MODES.find((mode) => mode.value === field.mode)?.help}
        {!isFed && isFile && ' A file input cannot have a fixed value.'}
      </p>

      {field.mode !== 'default' && !isFed && (
        <div className={styles.body}>
          {field.mode === 'shown' && (
            <div className={styles.grid}>
              <TextSetting
                label="Label"
                value={field.label}
                placeholder={shape.title ?? field.name}
                onChange={(label) => set({ label })}
              />
              <TextSetting
                label="Help"
                value={field.help}
                placeholder={shape.description}
                onChange={(help) => set({ help })}
              />
            </div>
          )}

          {canBeFile && field.mode === 'shown' && (
            <CheckboxSetting
              label="File input"
              checked={isFile}
              onChange={(checked) =>
                set(checked ? { display: 'file', accept: suggestAccept(field.name) } : { display: undefined, accept: undefined })
              }
            />
          )}
          {isFile && field.mode === 'shown' && (
            <fieldset className={styles.inline}>
              <legend className={styles.legend}>Accepts</legend>
              {MEDIA_KINDS.map((media) => (
                <CheckboxSetting
                  key={media}
                  label={MEDIA_LABELS[media]}
                  checked={field.accept?.includes(media) ?? false}
                  onChange={(checked) =>
                    set({ accept: MEDIA_KINDS.filter((candidate) => (candidate === media ? checked : field.accept?.includes(candidate))) })
                  }
                />
              ))}
            </fieldset>
          )}

          {!isFile && valueEditor}
          {!isFile && !valueEditor && (
            <ValueSetting
              field={field}
              property={property}
              label={field.mode === 'fixed' ? 'Value' : 'Default value'}
              onChange={(value) => set({ value })}
            />
          )}

          {field.mode === 'shown' && (kind === 'integer' || kind === 'number') && (
            <div className={styles.grid}>
              <NumberSetting
                label="Minimum"
                value={field.min}
                placeholder={shape.minimum}
                onChange={(min) => set({ min })}
              />
              <NumberSetting
                label="Maximum"
                value={field.max}
                placeholder={shape.maximum}
                onChange={(max) => set({ max })}
              />
              <NumberSetting
                label="Step"
                value={field.step}
                placeholder={kind === 'integer' ? 1 : undefined}
                onChange={(step) => set({ step })}
              />
            </div>
          )}

          {field.mode === 'shown' && kind === 'enum' && (
            <OptionsSetting
              field={field}
              choices={shape.enum ?? []}
              onChange={(options) => set({ options })}
            />
          )}

          {field.mode === 'shown' && DISPLAYS[kind].length > 1 && (
            <div className={styles.setting}>
              <Label htmlFor={`${id}-display`}>Display</Label>
              <Select
                items={[{ value: null, label: 'Automatic' }, ...DISPLAYS[kind].map((display) => ({ value: display, label: display }))]}
                value={field.display ?? null}
                onValueChange={(display) => set({ display: display ?? undefined })}
              >
                <SelectTrigger id={`${id}-display`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>Automatic</SelectItem>
                  {DISPLAYS[kind].map((display) => (
                    <SelectItem
                      key={display}
                      value={display}
                    >
                      {display}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {field.mode === 'shown' && (
            <TextSetting
              label="Group"
              value={field.group}
              placeholder="None, e.g. Advanced"
              suggestions={[...new Set(fields.flatMap((other) => (other.group ? [other.group] : [])))]}
              onChange={(group) => set({ group })}
            />
          )}

          <VisibleIfSetting
            value={field.visibleIf}
            candidates={[...variableCandidates, ...fieldCandidates(fields, schema, field.name)]}
            onChange={(visibleIf) => set({ visibleIf })}
          />
        </div>
      )}

      {issues.length > 0 && (
        <ul className={styles.issues}>
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Drops keys set to undefined, so the config stays plain JSON. */
export function withoutUndefined<T extends object>(config: T): T {
  return Object.fromEntries(Object.entries(config).filter(([, value]) => value !== undefined)) as T;
}

export function TextSetting({
  label,
  value,
  placeholder,
  suggestions,
  onChange,
}: {
  label: string;
  value: string | undefined;
  placeholder?: string;
  suggestions?: string[];
  onChange: (value: string | undefined) => void;
}) {
  const id = useId();
  return (
    <div className={styles.setting}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value ?? ''}
        placeholder={placeholder}
        list={suggestions ? `${id}-list` : undefined}
        onChange={(event) => onChange(event.target.value || undefined)}
      />
      {suggestions && (
        <datalist id={`${id}-list`}>
          {suggestions.map((suggestion) => (
            <option
              key={suggestion}
              value={suggestion}
            />
          ))}
        </datalist>
      )}
    </div>
  );
}

export function NumberSetting({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: number | undefined;
  placeholder?: number;
  onChange: (value: number | undefined) => void;
}) {
  const id = useId();
  return (
    <div className={styles.setting}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        step="any"
        value={value ?? ''}
        placeholder={placeholder === undefined ? undefined : String(placeholder)}
        onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
      />
    </div>
  );
}

export function CheckboxSetting({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className={styles.checkbox}>
      <Checkbox
        checked={checked}
        onCheckedChange={(next) => onChange(next === true)}
      />
      {label}
    </label>
  );
}

/**
 * The default or fixed value, edited with the control the User would get;
 * lists and objects, which Users never see, as JSON.
 */
export function ValueSetting({
  field,
  property,
  label,
  onChange,
}: {
  field: FieldConfig;
  property: JsonSchema;
  label: string;
  onChange: (value: JsonValue | undefined) => void;
}) {
  const id = useId();
  const kind = fieldKind(field, property);

  if (kind === 'list' || kind === 'object') {
    return (
      <JsonSetting
        id={id}
        label={label}
        value={field.value}
        onChange={onChange}
      />
    );
  }

  const [item] = buildStudioForm({
    fields: [{ ...field, mode: 'shown', visibleIf: undefined, value: undefined }],
    schema: { properties: { [field.name]: property } },
  }).items;
  if (!item) return null;
  // A slider cannot be empty; the value editor must be able to be.
  const control = item.control === 'slider' ? { ...item, control: 'number' as const } : item;
  return (
    <div className={styles.setting}>
      <div className={styles.valueLabel}>
        <Label htmlFor={id}>{label}</Label>
        {field.value !== undefined && (
          <Button
            variant="link"
            size="xs"
            onClick={() => onChange(undefined)}
          >
            Clear
          </Button>
        )}
      </div>
      <StudioFormControl
        id={id}
        item={control}
        value={field.value}
        onChange={(value) => onChange(value as JsonValue | undefined)}
      />
    </div>
  );
}

function JsonSetting({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: JsonValue | undefined;
  onChange: (value: JsonValue | undefined) => void;
}) {
  return (
    <div className={styles.setting}>
      <Label htmlFor={id}>{label} (JSON)</Label>
      <Textarea
        id={id}
        className="type-mono type-xs"
        defaultValue={value === undefined ? '' : JSON.stringify(value)}
        onBlur={(event) => {
          const text = event.target.value.trim();
          if (!text) return onChange(undefined);
          try {
            onChange(JSON.parse(text) as JsonValue);
          } catch {
            event.target.setCustomValidity('Not valid JSON');
            event.target.reportValidity();
          }
        }}
        onChange={(event) => event.target.setCustomValidity('')}
      />
    </div>
  );
}

/** Which of the schema's choices Users get, each with an optional label. */
function OptionsSetting({
  field,
  choices,
  onChange,
}: {
  field: FieldConfig;
  choices: string[];
  onChange: (options: FieldConfig['options']) => void;
}) {
  const options = field.options ?? choices.map((value) => ({ value, label: '' }));
  const update = (next: { value: string; label: string }[]) => {
    const untouched = next.length === choices.length && next.every((option) => !option.label);
    onChange(untouched ? undefined : next);
  };

  return (
    <fieldset className={styles.options}>
      <legend className={styles.legend}>Choices</legend>
      {choices.map((choice) => {
        const option = options.find((candidate) => candidate.value === choice);
        return (
          <div
            key={choice}
            className={styles.option}
          >
            <CheckboxSetting
              label={choice}
              checked={option !== undefined}
              onChange={(checked) =>
                update(
                  checked
                    ? choices.flatMap((value) =>
                        value === choice ? [{ value, label: '' }] : options.filter((candidate) => candidate.value === value),
                      )
                    : options.filter((candidate) => candidate.value !== choice),
                )
              }
            />
            <Input
              aria-label={`Label for ${choice}`}
              placeholder={choice}
              value={option?.label ?? ''}
              disabled={!option}
              onChange={(event) =>
                update(options.map((candidate) => (candidate.value === choice ? { ...candidate, label: event.target.value } : candidate)))
              }
            />
          </div>
        );
      })}
    </fieldset>
  );
}

/** "Shown only when": another Field or Variable with finitely many values, and which of them. */
export function VisibleIfSetting({
  value: visibleIf,
  candidates,
  onChange,
}: {
  value: VisibleIf | undefined;
  candidates: VisibleIfCandidate[];
  onChange: (visibleIf: VisibleIf | undefined) => void;
}) {
  const id = useId();
  const target = candidates.find((candidate) => candidate.name === visibleIf?.field);

  return (
    <div className={styles.setting}>
      <Label htmlFor={id}>Shown only when</Label>
      <Select
        items={[{ value: null, label: 'Always' }, ...candidates.map((candidate) => ({ value: candidate.name, label: candidate.name }))]}
        value={visibleIf?.field ?? null}
        onValueChange={(name) => {
          if (!name) return onChange(undefined);
          const first = candidates.find((candidate) => candidate.name === name)?.values[0];
          onChange({ field: name, in: first === undefined ? [] : [first.value] });
        }}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={null}>Always</SelectItem>
          {candidates.map((candidate) => (
            <SelectItem
              key={candidate.name}
              value={candidate.name}
            >
              {candidate.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {target && visibleIf && (
        <fieldset className={styles.inline}>
          <legend className={styles.legend}>is one of</legend>
          {target.values.map(({ value, label }) => (
            <CheckboxSetting
              key={String(value)}
              label={label}
              checked={visibleIf.in.some((candidate) => sameValue(candidate, value))}
              onChange={(checked) => {
                const next = checked ? [...visibleIf.in, value] : visibleIf.in.filter((candidate) => !sameValue(candidate, value));
                onChange({ field: target.name, in: next });
              }}
            />
          ))}
        </fieldset>
      )}
    </div>
  );
}
