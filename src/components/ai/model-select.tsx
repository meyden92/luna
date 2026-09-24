import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { GenerationModel } from './generation-options';
import styles from './model-select.module.css';

interface ModelSelectProps {
  models: GenerationModel[];
  value: string;
  onValueChange: (modelId: string) => void;
}

/** The model picker on the Create and Edit prompt bars. */
function ModelSelect({ models, value, onValueChange }: ModelSelectProps) {
  const model = models.find((entry) => entry.id === value);

  return (
    <Select
      value={value}
      onValueChange={(next) => onValueChange(String(next))}
    >
      <SelectTrigger
        size="sm"
        aria-label="Model"
        className={styles.trigger}
      >
        <SelectValue>{model?.label ?? 'Pick a model'}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {models.map((entry) => (
          <SelectItem
            key={entry.id}
            value={entry.id}
          >
            {entry.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export { ModelSelect };
