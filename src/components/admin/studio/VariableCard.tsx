import { Plus, Trash2, X } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { StudioFormControl } from '@/components/studio/form/StudioFormControl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Segmented } from '@/components/ui/segmented';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { JsonValue } from '@/db/schema/json';
import { buildStudioForm } from '@/libs/studio/form';
import { fileInputs } from '@/libs/studio/template-config';
import { type FieldConfig, type JsonSchema, MEDIA_KINDS, type MediaKind, type VariableConfig } from '@/libs/studio/types';
import { CheckboxSetting, fieldCandidates, NumberSetting, TextSetting, type VisibleIfCandidate, VisibleIfSetting } from './FieldCard';
import styles from './FieldCard.module.css';

type Kind = VariableConfig['kind'];

const TEXT_KINDS: { value: Exclude<Kind, 'file'>; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'choice', label: 'Choice' },
  { value: 'multi', label: 'Multi-choice' },
  { value: 'number', label: 'Number' },
  { value: 'switch', label: 'Switch' },
];

const MEDIA_LABELS: Record<MediaKind, string> = { image: 'Images', video: 'Videos', audio: 'Audio', model3d: '3D models' };

/** The Variables with finitely many values, as `visibleIf` candidates for anything but `exclude`. */
export function variableCandidates(variables: VariableConfig[], exclude?: string): VisibleIfCandidate[] {
  return variables.flatMap((variable): VisibleIfCandidate[] => {
    if (variable.name === exclude) return [];
    if (variable.kind === 'switch') {
      return [
        {
          name: variable.name,
          values: [
            { value: true, label: 'On' },
            { value: false, label: 'Off' },
          ],
        },
      ];
    }
    if (variable.kind !== 'choice') return [];
    return [
      {
        name: variable.name,
        values: (variable.options ?? []).map((option) => ({ value: option.value, label: option.label || option.value })),
      },
    ];
  });
}

/** A Variable switched to another kind: the new kind's settings, no default. */
function withKind(variable: VariableConfig, kind: Kind): VariableConfig {
  const { default: _default, text: _text, number: _number, switch: _switch, ...rest } = variable;
  if (kind === 'number') return { ...rest, kind, number: { min: 0, max: 10, step: 1, display: 'number' } };
  if (kind === 'switch') return { ...rest, kind, switch: { on: '', off: '' } };
  if (kind === 'choice' || kind === 'multi') return { ...rest, kind, options: variable.options ?? [] };
  const { options: _options, ...plain } = rest;
  return { ...plain, kind };
}

/** Drops keys set to undefined, so the config stays plain JSON. */
function withoutUndefined(variable: VariableConfig): VariableConfig {
  return Object.fromEntries(Object.entries(variable).filter(([, value]) => value !== undefined)) as unknown as VariableConfig;
}

/**
 * Configures one Template Variable: kind, label, help, required, default,
 * group, `visibleIf` and the kind's own settings. Text Variables come and go
 * with the text; a file Variable feeds a Model file input and is removed here.
 */
export function VariableCard({
  variable,
  variables,
  fields,
  schema,
  issues,
  onChange,
  onRemove,
  handle,
}: {
  variable: VariableConfig;
  /** All of the Template's Variables, for the `visibleIf` choices and group suggestions. */
  variables: VariableConfig[];
  fields: FieldConfig[];
  schema: JsonSchema;
  issues: string[];
  onChange: (variable: VariableConfig) => void;
  onRemove: () => void;
  /** The drag handle from `SortableList`. */
  handle: ReactNode;
}) {
  const id = useId();
  const set = (change: Partial<VariableConfig>) => onChange(withoutUndefined({ ...variable, ...change }));
  const isFile = variable.kind === 'file';

  return (
    <section
      aria-label={`Variable ${variable.name}`}
      className={styles.card}
      data-mode="shown"
    >
      <div className={styles.head}>
        {handle}
        <span className={styles.name}>{`{${variable.name}}`}</span>
        {isFile ? (
          <>
            <span className={styles.kind}>file</span>
            <Button
              variant="ghost"
              size="icon-sm"
              className={styles.mode}
              aria-label={`Remove ${variable.name}`}
              onClick={onRemove}
            >
              <Trash2 />
            </Button>
          </>
        ) : (
          <div className={styles.mode}>
            <Select
              items={TEXT_KINDS}
              value={variable.kind}
              onValueChange={(kind) => kind && onChange(withKind(variable, kind))}
            >
              <SelectTrigger
                id={`${id}-kind`}
                aria-label={`Kind of ${variable.name}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEXT_KINDS.map((kind) => (
                  <SelectItem
                    key={kind.value}
                    value={kind.value}
                  >
                    {kind.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.grid}>
          {isFile && (
            <TextSetting
              label="Name"
              value={variable.name}
              onChange={(name) => set({ name: name ?? '' })}
            />
          )}
          <TextSetting
            label="Label"
            value={variable.label}
            placeholder={variable.name}
            onChange={(label) => set({ label })}
          />
          <TextSetting
            label="Help"
            value={variable.help}
            onChange={(help) => set({ help })}
          />
        </div>
        <CheckboxSetting
          label="Required"
          checked={variable.required}
          onChange={(required) => set({ required })}
        />

        {variable.kind === 'text' && (
          <>
            <CheckboxSetting
              label="Multiline"
              checked={variable.text?.multiline ?? false}
              onChange={(multiline) => set({ text: { ...variable.text, multiline } })}
            />
            <div className={styles.grid}>
              <TextSetting
                label="Placeholder"
                value={variable.text?.placeholder}
                onChange={(placeholder) => set({ text: { multiline: false, ...variable.text, placeholder } })}
              />
              <NumberSetting
                label="Maximum length"
                value={variable.text?.maxLength}
                onChange={(maxLength) => set({ text: { multiline: false, ...variable.text, maxLength } })}
              />
            </div>
          </>
        )}

        {(variable.kind === 'choice' || variable.kind === 'multi') && (
          <OptionsEditor
            variable={variable}
            onChange={onChange}
          />
        )}

        {variable.kind === 'number' && variable.number && (
          <>
            <div className={styles.grid}>
              <NumberSetting
                label="Minimum"
                value={variable.number.min}
                onChange={(min) => set({ number: { ...(variable.number as NonNullable<VariableConfig['number']>), min: min ?? 0 } })}
              />
              <NumberSetting
                label="Maximum"
                value={variable.number.max}
                onChange={(max) => set({ number: { ...(variable.number as NonNullable<VariableConfig['number']>), max: max ?? 0 } })}
              />
              <NumberSetting
                label="Step"
                value={variable.number.step}
                onChange={(step) => set({ number: { ...(variable.number as NonNullable<VariableConfig['number']>), step: step ?? 1 } })}
              />
            </div>
            <Segmented
              label={`Display of ${variable.name}`}
              value={variable.number.display}
              onValueChange={(display) => set({ number: { ...(variable.number as NonNullable<VariableConfig['number']>), display } })}
              items={[
                { value: 'number', label: 'Number' },
                { value: 'slider', label: 'Slider' },
              ]}
            />
          </>
        )}

        {variable.kind === 'switch' && (
          <div className={styles.grid}>
            <TextSetting
              label="Text when on"
              value={variable.switch?.on}
              onChange={(on) => set({ switch: { off: variable.switch?.off ?? '', on: on ?? '' } })}
            />
            <TextSetting
              label="Text when off"
              value={variable.switch?.off}
              onChange={(off) => set({ switch: { on: variable.switch?.on ?? '', off: off ?? '' } })}
            />
          </div>
        )}

        {isFile && (
          <FileTarget
            variable={variable}
            schema={schema}
            onChange={onChange}
          />
        )}

        {!isFile && (
          <DefaultSetting
            variable={variable}
            onChange={(value) => set({ default: value })}
          />
        )}

        <TextSetting
          label="Group"
          value={variable.group}
          placeholder="None, e.g. Advanced"
          suggestions={[...new Set([...variables, ...fields].flatMap((other) => (other.group ? [other.group] : [])))]}
          onChange={(group) => set({ group })}
        />

        <VisibleIfSetting
          value={variable.visibleIf}
          candidates={[...variableCandidates(variables, variable.name), ...fieldCandidates(fields, schema)]}
          onChange={(visibleIf) => set({ visibleIf })}
        />
      </div>

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

/** The default, edited with the control Users get. */
function DefaultSetting({ variable, onChange }: { variable: VariableConfig; onChange: (value: JsonValue | undefined) => void }) {
  const id = useId();
  const [item] = buildStudioForm({ fields: [], schema: {}, variables: [{ ...variable, visibleIf: undefined, default: undefined }] }).items;
  if (!item) return null;
  // A slider cannot be empty; the default editor must be able to be.
  const control = item.control === 'slider' ? { ...item, control: 'number' as const } : item;
  return (
    <div className={styles.setting}>
      <div className={styles.valueLabel}>
        <Label htmlFor={id}>Default</Label>
        {variable.default !== undefined && (
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
        value={variable.default}
        onChange={(value) => onChange(value as JsonValue | undefined)}
      />
    </div>
  );
}

/**
 * A choice's options: the value goes into the prompt, the label is what
 * Users see (the value when empty). The editor writes values and the default
 * back into the text.
 */
function OptionsEditor({ variable, onChange }: { variable: VariableConfig; onChange: (variable: VariableConfig) => void }) {
  const options = variable.options ?? [];
  const setOptions = (next: { label: string; value: string }[], renamed?: { from: string; to: string }) => {
    let fallback = variable.default;
    const values = next.map((option) => option.value);
    const rename = (value: JsonValue) => (renamed && value === renamed.from ? renamed.to : value);
    if (Array.isArray(fallback)) fallback = fallback.map(rename).filter((value) => values.includes(value as string));
    else if (fallback !== undefined) fallback = values.includes(rename(fallback) as string) ? rename(fallback) : undefined;
    if (Array.isArray(fallback) && fallback.length === 0) fallback = undefined;
    const { default: _default, ...rest } = variable;
    onChange({ ...rest, options: next, ...(fallback === undefined ? {} : { default: fallback }) });
  };

  return (
    <fieldset className={styles.options}>
      <legend className={styles.legend}>Options</legend>
      {options.map((option, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: an option's value is what is being edited, so its place is its identity
          key={index}
          className={styles.option}
        >
          <Input
            aria-label={`Value of option ${index + 1}`}
            className="type-mono"
            value={option.value}
            onChange={(event) =>
              setOptions(
                options.map((candidate, at) => (at === index ? { ...candidate, value: event.target.value } : candidate)),
                { from: option.value, to: event.target.value },
              )
            }
          />
          <Input
            aria-label={`Label for ${option.value}`}
            placeholder={option.value}
            value={option.label}
            onChange={(event) =>
              setOptions(options.map((candidate, at) => (at === index ? { ...candidate, label: event.target.value } : candidate)))
            }
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove option ${option.value}`}
            onClick={() => setOptions(options.filter((_, at) => at !== index))}
          >
            <X />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOptions([...options, { label: '', value: `Option ${options.length + 1}` }])}
      >
        <Plus />
        Add option
      </Button>
    </fieldset>
  );
}

/** Which Model file input a file Variable feeds, at which position of a list input, and what it accepts. */
function FileTarget({
  variable,
  schema,
  onChange,
}: {
  variable: VariableConfig;
  schema: JsonSchema;
  onChange: (variable: VariableConfig) => void;
}) {
  const id = useId();
  const inputs = fileInputs(schema);
  const target = variable.file ?? { field: inputs[0]?.name ?? '', accept: ['image'] };
  const list = inputs.find((input) => input.name === target.field)?.list ?? false;
  const setTarget = (file: NonNullable<VariableConfig['file']>) => onChange({ ...variable, file });

  return (
    <>
      <div className={styles.grid}>
        <div className={styles.setting}>
          <Label htmlFor={`${id}-field`}>Feeds input</Label>
          <Select
            items={inputs.map((input) => ({ value: input.name, label: input.name }))}
            value={target.field}
            onValueChange={(field) => {
              if (!field) return;
              const isList = inputs.find((input) => input.name === field)?.list ?? false;
              setTarget({ field, accept: target.accept, ...(isList ? { position: 0 } : {}) });
            }}
          >
            <SelectTrigger id={`${id}-field`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {inputs.map((input) => (
                <SelectItem
                  key={input.name}
                  value={input.name}
                >
                  {input.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {list && (
          <NumberSetting
            label="Position"
            value={target.position === undefined ? undefined : target.position + 1}
            placeholder={1}
            onChange={(position) => {
              const { position: _position, ...rest } = target;
              setTarget(position === undefined ? rest : { ...rest, position: position - 1 });
            }}
          />
        )}
      </div>
      <fieldset className={styles.inline}>
        <legend className={styles.legend}>Accepts</legend>
        {MEDIA_KINDS.map((media) => (
          <CheckboxSetting
            key={media}
            label={MEDIA_LABELS[media]}
            checked={target.accept.includes(media)}
            onChange={(checked) =>
              setTarget({
                ...target,
                accept: MEDIA_KINDS.filter((candidate) => (candidate === media ? checked : target.accept.includes(candidate))),
              })
            }
          />
        ))}
      </fieldset>
    </>
  );
}
