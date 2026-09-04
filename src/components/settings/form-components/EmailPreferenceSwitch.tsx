import { Switch } from '@/components/ui/switch';
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from '@/components/ui/tanstack-form';
import styles from './field.module.css';

export function EmailPreferenceSwitch() {
  return (
    <FormField
      name="receiveEmails"
      renderFieldAction={({ value, onChange }) => (
        <FormItem className={styles.row}>
          <div className={styles.text}>
            <FormLabel className={styles.label}>Marketing emails</FormLabel>
            <FormDescription>Receive emails about new products, features, and more.</FormDescription>
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
