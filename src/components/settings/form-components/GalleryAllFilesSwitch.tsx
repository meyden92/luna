import { Switch } from '@/components/ui/switch';
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from '@/components/ui/tanstack-form';
import styles from './field.module.css';

export function GalleryAllFilesSwitch() {
  return (
    <FormField
      name="showAllFilesIncludesFoldered"
      renderFieldAction={({ value, onChange }) => (
        <FormItem className={styles.row}>
          <div className={styles.text}>
            <FormLabel className={styles.label}>Include foldered files in All Files</FormLabel>
            <FormDescription>When disabled, &apos;All Files&apos; only shows files without a folder assignment.</FormDescription>
          </div>
          <FormControl>
            <Switch
              checked={Boolean(value)}
              onCheckedChange={onChange}
            />
          </FormControl>
        </FormItem>
      )}
    />
  );
}
