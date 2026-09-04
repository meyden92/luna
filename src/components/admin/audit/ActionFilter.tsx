import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import styles from './ActionFilter.module.css';

interface ActionFilterProps {
  currentAction?: string;
  onActionChangeAction: (filters: { action?: string }) => void;
}

const actionLabels: Record<string, string> = {
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
};

export default function ActionFilter({ currentAction, onActionChangeAction }: ActionFilterProps) {
  const actionTypes = ['create', 'update', 'delete'];

  const handleValueChange = (value: string | null) => {
    if (value) {
      onActionChangeAction({ action: value === 'all' ? undefined : value });
    }
  };

  const handleClear = () => {
    onActionChangeAction({ action: undefined });
  };

  return (
    <div className="cluster space-2">
      <Select
        value={currentAction || 'all'}
        onValueChange={handleValueChange}
      >
        <SelectTrigger
          id="action-filter"
          className={styles.select}
          aria-label="Filter by action"
        >
          <SelectValue placeholder="All Actions" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Actions</SelectItem>
          {actionTypes.map((action) => (
            <SelectItem
              key={action}
              value={action}
            >
              {actionLabels[action]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {currentAction && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleClear}
          aria-label="Clear action filter"
        >
          <X />
        </Button>
      )}
    </div>
  );
}
