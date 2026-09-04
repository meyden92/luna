import { Switch } from '@/components/ui/switch';
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from '@/components/ui/tanstack-form';
import styles from './field.module.css';

export function ProfileVisibilitySwitch() {
  return (
    <FormField
      name="isProfilePublic"
      renderFieldAction={({ value, onChange }) => (
        <FormItem className={styles.row}>
          <div className={styles.text}>
            <FormLabel className={styles.label}>Public profile</FormLabel>
            <FormDescription>Allow other users to view your profile information.</FormDescription>
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
