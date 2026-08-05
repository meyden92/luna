import { FormControl, FormDescription, FormField, FormItem, FormLabel } from '@/components/ui/tanstack-form';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/libs/utils';
import { PROFILE_DESCRIPTION_MAX_LENGTH } from '@/libs/validation/profile_settings';

export function ProfileDescriptionInput() {
  return (
    <FormField
      name="description"
      validators={{
        onChange: ({ value }) =>
          String(value ?? '').length > PROFILE_DESCRIPTION_MAX_LENGTH
            ? `Description must be ${PROFILE_DESCRIPTION_MAX_LENGTH} characters or fewer.`
            : undefined,
      }}
      renderFieldAction={({ value, onChange, onBlur }) => {
        const characterCount = String(value ?? '').length;
        const isNearLimit = characterCount > PROFILE_DESCRIPTION_MAX_LENGTH * 0.9;

        return (
          <FormItem className="space-y-2 rounded-lg border p-4">
            <div className="space-y-0.5">
              <FormLabel className="text-base">Description</FormLabel>
              <FormDescription>A short description about you.</FormDescription>
            </div>
            <FormControl>
              <Textarea
                value={value ?? ''}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onBlur}
                maxLength={PROFILE_DESCRIPTION_MAX_LENGTH}
                rows={5}
                className="min-h-32 resize-y"
                placeholder="Enter a description"
              />
            </FormControl>
            <p className={cn('text-right text-xs text-muted-foreground', isNearLimit && 'text-amber-600')}>
              {characterCount}/{PROFILE_DESCRIPTION_MAX_LENGTH}
            </p>
          </FormItem>
        );
      }}
    />
  );
}
