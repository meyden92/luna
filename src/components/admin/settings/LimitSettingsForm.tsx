import { useSuspenseQuery } from '@tanstack/react-query';
import { SlidersHorizontal } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { queryKeys } from '@/libs/query-keys';
import { type LimitSettings, limitSettingsSchema } from '@/schemas/platform-settings-schema';
import { saveLimitSettings } from '@/server/fns/admin/platform-settings';
import { platformSettingsQueryOptions } from './queries';
import styles from './settings-form.module.css';

type LimitName = keyof LimitSettings;

const GROUPS: { title: string; description: string; fields: { name: LimitName; label: string; help?: string }[] }[] = [
  {
    title: 'Storage and uploads',
    description: 'Sizes are in MiB.',
    fields: [
      {
        name: 'defaultStorageQuotaMib',
        label: 'Default storage quota (MiB)',
        help: 'Given to new Users; change one User’s quota on their page.',
      },
      { name: 'avatarMaxUploadMib', label: 'Maximum Avatar upload (MiB)' },
      { name: 'sharexMaxUploadMib', label: 'Maximum ShareX upload (MiB)' },
      {
        name: 'sharexUploadConcurrency',
        label: 'ShareX uploads processed at once',
        help: 'Further uploads are refused with 503 until one finishes.',
      },
      { name: 'downloadProxyMaxMib', label: 'Maximum file download through the app (MiB)' },
    ],
  },
  {
    title: 'Downloader',
    description: 'Videos fetched from Instagram posts.',
    fields: [
      { name: 'downloaderMaxVideoMib', label: 'Maximum video size (MiB)' },
      { name: 'downloaderMaxPreparingPerUser', label: 'Downloads preparing at once per User', help: 'The rest wait in the queue.' },
      { name: 'downloaderExpiryMinutes', label: 'Minutes a finished Download keeps its files' },
    ],
  },
  {
    title: 'Moderation',
    description: 'The denylist check on every upload.',
    fields: [
      {
        name: 'phashDistanceThreshold',
        label: 'Maximum perceptual hash distance (0–64)',
        help: 'An image this close to a denylisted one is quarantined. Higher catches more edits and more false matches.',
      },
    ],
  },
];

/** Instance-wide size, concurrency and time limits. */
export function LimitSettingsForm() {
  const { data: settings } = useSuspenseQuery(platformSettingsQueryOptions);
  const [values, setValues] = useState<Record<LimitName, string>>(
    () =>
      Object.fromEntries(GROUPS.flatMap((group) => group.fields).map(({ name }) => [name, String(settings[name])])) as Record<
        LimitName,
        string
      >,
  );
  const shape = limitSettingsSchema.shape;

  const save = useAppMutation(saveLimitSettings, {
    successMessage: 'Limits saved',
    invalidates: [queryKeys.admin.platformSettings],
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save.mutate(Object.fromEntries(Object.entries(values).map(([name, value]) => [name, Number(value)])) as LimitSettings);
  };

  return (
    <div className="stack space-6">
      <div>
        <h1 className="cluster space-2 type-2xl weight-bold">
          <SlidersHorizontal className={styles.titleIcon} />
          Limits
        </h1>
        <p className={styles.muted}>Apply immediately, without a restart.</p>
      </div>

      <form
        className="stack space-6"
        onSubmit={onSubmit}
      >
        {GROUPS.map((group) => (
          <Card key={group.title}>
            <CardHeader>
              <CardTitle>{group.title}</CardTitle>
              <CardDescription>{group.description}</CardDescription>
            </CardHeader>
            <CardContent className="stack space-4">
              {group.fields.map((field) => (
                <div
                  key={field.name}
                  className="stack space-2"
                >
                  <Label htmlFor={`limit-${field.name}`}>{field.label}</Label>
                  <Input
                    id={`limit-${field.name}`}
                    type="number"
                    step="1"
                    min={shape[field.name].minValue ?? undefined}
                    max={shape[field.name].maxValue ?? undefined}
                    required
                    value={values[field.name]}
                    onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                    disabled={save.isPending}
                  />
                  {field.help && <p className={styles.muted}>{field.help}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
        <div>
          <Button
            type="submit"
            disabled={save.isPending}
          >
            Save limits
          </Button>
        </div>
      </form>
    </div>
  );
}
