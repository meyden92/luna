import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CONDITION_FIELD_LABELS,
  CONDITION_FIELDS,
  type ConditionField,
  type StepNode,
  TRIGGER_LABELS,
  TRIGGER_TYPES,
  type TriggerType,
} from '@/libs/flows/linear-flow';
import styles from './StepFields.module.css';
import { TagChipInput } from './TagChipInput';

type FolderOption = { id: string; name: string };

/*
 * Base UI's SelectValue renders the raw value unless the Select root is handed
 * the options, so these triggers would read "upload" and "title" rather than
 * their labels. Same reason the folder select below builds its items inline.
 */
const TRIGGER_ITEMS = TRIGGER_TYPES.map((trigger) => ({ value: trigger, label: TRIGGER_LABELS[trigger] }));
const CONDITION_FIELD_ITEMS = CONDITION_FIELDS.map((field) => ({ value: field, label: CONDITION_FIELD_LABELS[field] }));

/** The "When" select. Its width is fixed so the longest trigger label fits on one line. */
function TriggerField({ value, onChange }: { value: TriggerType; onChange: (trigger: TriggerType) => void }) {
  return (
    <Select
      items={TRIGGER_ITEMS}
      value={value}
      onValueChange={(next: string | null) => next && onChange(next as TriggerType)}
    >
      <SelectTrigger
        size="sm"
        aria-label="Trigger"
        className={styles.triggerSelect}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TRIGGER_ITEMS.map((item) => (
          <SelectItem
            key={item.value}
            value={item.value}
          >
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The editable part of a step card, one branch per node type. The card shell owns
 * the row layout, so each branch only returns its controls.
 */
function StepFields({ step, folders, onChange }: { step: StepNode; folders: FolderOption[]; onChange: (step: StepNode) => void }) {
  if (step.type === 'condition') {
    return (
      <>
        <Select
          items={CONDITION_FIELD_ITEMS}
          value={step.config.field}
          onValueChange={(next: string | null) => next && onChange({ ...step, config: { ...step.config, field: next as ConditionField } })}
        >
          <SelectTrigger
            size="sm"
            aria-label="Field to check"
            className={styles.fieldSelect}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONDITION_FIELD_ITEMS.map((item) => (
              <SelectItem
                key={item.value}
                value={item.value}
              >
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>contains</span>
        <Input
          value={step.config.contains}
          aria-label="Text to look for"
          placeholder="e.g. screenshot"
          className={styles.textInput}
          onChange={(event) => onChange({ ...step, config: { ...step.config, contains: event.target.value } })}
        />
      </>
    );
  }

  if (step.type === 'route-folder') {
    // Without a folder there is nowhere to move files, and the step cannot be saved.
    if (folders.length === 0) return <span className={styles.note}>Create a folder in Files first.</span>;

    return (
      <Select
        items={folders.map((folder) => ({ value: folder.id, label: folder.name }))}
        value={step.config.folderId || null}
        onValueChange={(next: string | null) => next && onChange({ ...step, config: { folderId: next } })}
      >
        <SelectTrigger
          size="sm"
          aria-label="Destination folder"
          className={styles.folderSelect}
        >
          <SelectValue placeholder="Choose a folder" />
        </SelectTrigger>
        <SelectContent>
          {folders.map((folder) => (
            <SelectItem
              key={folder.id}
              value={folder.id}
            >
              {folder.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (step.type === 'tag') {
    return (
      <TagChipInput
        tags={step.config.tags}
        onChange={(tags) => onChange({ ...step, config: { tags } })}
      />
    );
  }

  return (
    <Segmented
      label="Visibility"
      value={step.config.private ? 'private' : 'public'}
      onValueChange={(next) => onChange({ ...step, config: { private: next === 'private' } })}
      items={[
        { value: 'private', label: 'Only me' },
        { value: 'public', label: 'Anyone with the link' },
      ]}
    />
  );
}

export { type FolderOption, StepFields, TriggerField };
