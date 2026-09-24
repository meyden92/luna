import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { TRIGGER_LABELS, type TriggerType } from '@/libs/flows/linear-flow';
import styles from './AutomationList.module.css';

type AutomationListItem = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: TriggerType;
  stepCount: number;
};

type AutomationListProps = {
  items: AutomationListItem[];
  activeId: string | null;
  creating: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onCreate: () => void;
};

/**
 * The 300px column: every automation the owner has, with the trigger and step
 * count it runs and a switch to pause it without opening it.
 */
function AutomationList({ items, activeId, creating, onSelect, onToggle, onCreate }: AutomationListProps) {
  return (
    <aside className={styles.root}>
      <div className={styles.head}>
        <h1 className={styles.title}>Automations</h1>
        <Button
          size="sm"
          disabled={creating}
          onClick={onCreate}
        >
          <Plus />
          New
        </Button>
      </div>
      <p className={styles.subtitle}>Rules that sort, tag and protect files for you.</p>

      <div className={styles.rows}>
        {items.map((item) => (
          // The switch is a sibling of the select button rather than nested in it,
          // so pausing an automation never doubles as opening it.
          <div
            key={item.id}
            className={styles.row}
            data-active={item.id === activeId || undefined}
            data-paused={item.enabled ? undefined : ''}
          >
            <button
              type="button"
              className={styles.select}
              onClick={() => onSelect(item.id)}
            >
              <span className={styles.name}>{item.name}</span>
              <span className={styles.meta}>
                {TRIGGER_LABELS[item.trigger]} · {item.stepCount} {item.stepCount === 1 ? 'step' : 'steps'}
              </span>
            </button>
            <Switch
              size="sm"
              checked={item.enabled}
              aria-label={`${item.name} is ${item.enabled ? 'on' : 'paused'}`}
              onCheckedChange={(checked) => onToggle(item.id, checked)}
            />
          </div>
        ))}
      </div>
    </aside>
  );
}

export { AutomationList, type AutomationListItem };
