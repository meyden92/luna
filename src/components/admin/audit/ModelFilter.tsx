import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ModelFilterProps {
  currentModel?: string;
  models: string[];
  onModelChangeAction: (filters: { model?: string }) => void;
}

export default function ModelFilter({ currentModel, models, onModelChangeAction }: ModelFilterProps) {
  const handleValueChange = (value: string | null) => {
    if (value) {
      onModelChangeAction({ model: value === 'all' ? undefined : value });
    }
  };

  const handleClear = () => {
    onModelChangeAction({ model: undefined });
  };

  return (
    <div className="flex items-center gap-2">
      <Select
        value={currentModel || 'all'}
        onValueChange={handleValueChange}
      >
        <SelectTrigger
          id="model-filter"
          className="flex-grow"
          aria-label="Filter by model"
        >
          <SelectValue placeholder="All Models" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Models</SelectItem>
          {models.map((model) => (
            <SelectItem
              key={model}
              value={model}
            >
              {model}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {currentModel && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleClear}
          aria-label="Clear model filter"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
