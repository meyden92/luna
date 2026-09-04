import { Filter } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import styles from './task-filters.module.css';

type StatusFilter = 'all' | 'running' | 'scheduled' | 'stopped' | 'disabled';

interface TaskFiltersProps {
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
}

export default function TaskFilters({ statusFilter, onStatusFilterChange }: TaskFiltersProps) {
  return (
    <div className={styles.root}>
      <Filter className={styles.icon} />
      <Select
        value={statusFilter}
        onValueChange={(v) => v && onStatusFilterChange(v as StatusFilter)}
      >
        <SelectTrigger className={styles.select}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="running">Running</SelectItem>
          <SelectItem value="scheduled">Scheduled</SelectItem>
          <SelectItem value="stopped">Stopped</SelectItem>
          <SelectItem value="disabled">Disabled</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
