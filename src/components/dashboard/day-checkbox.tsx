import { startTransition } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { getDaySelectionState, useBulkSelection } from '@/hooks/stores/use-bulk-selection';
import styles from './day-checkbox.module.css';

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
    <div className={styles.root}>
      <Checkbox
        checked={selectionState === 'checked'}
        indeterminate={selectionState === 'indeterminate'}
        onCheckedChange={handleClick}
        className={styles.checkbox}
        aria-label={`Select all in ${date}`}
      />
      <span className={styles.label}>Select all</span>
    </div>
  );
}
