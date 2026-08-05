import { Switch } from '@/components/ui/switch';
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from '@/components/ui/tanstack-form';

export function ProfileVisibilitySwitch() {
  return (
    <FormField
      name="isProfilePublic"
      renderFieldAction={({ value, onChange }) => (
        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <FormLabel className="text-base">Public profile</FormLabel>
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
