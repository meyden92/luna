import { Switch } from '@/components/ui/switch';
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from '@/components/ui/tanstack-form';

export function EmailPreferenceSwitch() {
  return (
    <FormField
      name="receiveEmails"
      renderFieldAction={({ value, onChange }) => (
        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <FormLabel className="text-base">Marketing emails</FormLabel>
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
