import { ChevronDown } from 'lucide-react';
import { useId } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { type FormItem, type StudioFormSpec, type StudioFormValues, visibleFormItems } from '@/libs/studio/form';
import styles from './StudioForm.module.css';
import { StudioFormControl } from './StudioFormControl';

export interface StudioFormProps {
  /** From `buildStudioForm`. */
  form: StudioFormSpec;
  /** Start from `initialFormValues(form)`; send with `studioFormData`. */
  values: StudioFormValues;
  onChange: (values: StudioFormValues) => void;
  disabled?: boolean;
}

/**
 * The form Users fill in for a Model or Template, exactly as the Studio
 * shows it. Ungrouped items come first; each group follows as a collapsed
 * section, placed by its first item. Items hidden by `visibleIf` are not
 * rendered, and their values stay as they were.
 */
export function StudioForm({ form, values, onChange, disabled }: StudioFormProps) {
  const visible = visibleFormItems(form, values);
  const groups = [...new Set(visible.flatMap((item) => (item.group ? [item.group] : [])))];

  const field = (item: FormItem) => (
    <FormField
      key={item.name}
      item={item}
      values={values}
      onChange={onChange}
      disabled={disabled}
    />
  );

  return (
    <div className={styles.form}>
      {visible.filter((item) => !item.group).map(field)}
      {groups.map((group) => (
        <Collapsible
          key={group}
          className={styles.group}
        >
          <CollapsibleTrigger className={styles.groupTrigger}>
            {group}
            <ChevronDown className={styles.chevron} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className={styles.groupBody}>{visible.filter((item) => item.group === group).map(field)}</div>
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  );
}

function FormField({
  item,
  values,
  onChange,
  disabled,
}: {
  item: FormItem;
  values: StudioFormValues;
  onChange: (values: StudioFormValues) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const control = (
    <StudioFormControl
      id={id}
      item={item}
      value={values[item.name]}
      disabled={disabled}
      onChange={(value) => {
        const next = { ...values };
        if (value === undefined) delete next[item.name];
        else next[item.name] = value;
        onChange(next);
      }}
    />
  );

  return (
    <div className={item.control === 'switch' ? styles.switchField : styles.field}>
      <Label htmlFor={id}>
        {item.label}
        {item.required && <span aria-hidden> *</span>}
      </Label>
      {control}
      {item.help && <p className={styles.help}>{item.help}</p>}
    </div>
  );
}
