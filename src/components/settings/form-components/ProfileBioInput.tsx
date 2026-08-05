import { Input } from '@/components/ui/input';
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from '@/components/ui/tanstack-form';
import { cn } from '@/libs/utils';
import { PROFILE_BIO_MAX_LENGTH } from '@/libs/validation/profile_settings';

export function ProfileBioInput() {
  return (
    <FormField
      name="bio"
      validators={{
        onChange: ({ value }) =>
          String(value ?? '').length > PROFILE_BIO_MAX_LENGTH ? `Bio must be ${PROFILE_BIO_MAX_LENGTH} characters or fewer.` : undefined,
      }}
      renderFieldAction={({ value, onChange, onBlur }) => {
        const characterCount = String(value ?? '').length;
        const isNearLimit = characterCount > PROFILE_BIO_MAX_LENGTH * 0.9;

        return (
          <FormItem className="space-y-2 rounded-lg border p-4">
            <div className="space-y-0.5">
              <FormLabel className="text-base">Bio</FormLabel>
              <FormDescription>A short bio about you.</FormDescription>
            </div>
            <FormControl>
              <Input
                value={value ?? ''}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onBlur}
                maxLength={PROFILE_BIO_MAX_LENGTH}
                placeholder="Enter a short bio"
              />
            </FormControl>
            <p className={cn('text-right text-xs text-muted-foreground', isNearLimit && 'text-amber-600')}>
              {characterCount}/{PROFILE_BIO_MAX_LENGTH}
            </p>
          </FormItem>
        );
      }}
    />
  );
}
