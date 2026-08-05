import { Filter } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type StatusFilter = 'all' | 'running' | 'scheduled' | 'stopped' | 'disabled';

interface TaskFiltersProps {
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
}

export default function TaskFilters({ statusFilter, onStatusFilterChange }: TaskFiltersProps) {
  return (
    <div className="flex items-center gap-2">
      <Filter className="h-4 w-4" />
      <Select
        value={statusFilter}
        onValueChange={(v) => v && onStatusFilterChange(v as StatusFilter)}
      >
        <SelectTrigger className="w-32">
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
