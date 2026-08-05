import { startTransition } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { getDaySelectionState, useBulkSelection } from '@/hooks/stores/use-bulk-selection';

interface DayCheckboxProps {
  date: string;
  fileIds: string[];
}

export function DayCheckbox({ date, fileIds }: DayCheckboxProps) {
  const selectionState = useBulkSelection((state) => getDaySelectionState(state.selectedFiles, fileIds));
  const selectFiles = useBulkSelection((state) => state.selectFiles);
  const deselectFiles = useBulkSelection((state) => state.deselectFiles);

  const handleClick = () => {
    // Mark selection as non-urgent so React can batch re-renders
    startTransition(() => {
      const selectedFiles = useBulkSelection.getState().selectedFiles;
      const unselectedFiles = fileIds.filter((id) => !selectedFiles.has(id));
      if (unselectedFiles.length > 0) {
        selectFiles(unselectedFiles);
      } else {
        deselectFiles(fileIds);
      }
    });
  };

  return (
    <div className="ml-3 inline-flex items-center gap-2 rounded-full border border-luna-line bg-luna-bg px-2.5 py-1">
      <Checkbox
        checked={selectionState === 'checked'}
        indeterminate={selectionState === 'indeterminate'}
        onCheckedChange={handleClick}
        className="cursor-pointer"
        aria-label={`Select all in ${date}`}
      />
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-luna-ink-4">Select all</span>
    </div>
  );
}
