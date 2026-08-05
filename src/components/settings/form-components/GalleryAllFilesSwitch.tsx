import { Switch } from '@/components/ui/switch';
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from '@/components/ui/tanstack-form';

export function GalleryAllFilesSwitch() {
  return (
    <FormField
      name="showAllFilesIncludesFoldered"
      renderFieldAction={({ value, onChange }) => (
        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <FormLabel className="text-base">Include foldered files in All Files</FormLabel>
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
