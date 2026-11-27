import { useSuspenseQuery } from '@tanstack/react-query';
import { Settings2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { queryKeys } from '@/libs/query-keys';
import { studioSettingsSchema } from '@/schemas/studio-schema';
import { saveStudioSettings } from '@/server/fns/admin/studio-budgets';
import styles from './ModelList.module.css';
import { studioSettingsQueryOptions } from './queries';

type FileSetting = 'outputLifetimeDays' | 'inputMaxMib' | 'templatePreviewMaxMib' | 'templateReferenceMaxMib';

const FILE_SETTINGS: { name: FileSetting; label: string; help: string }[] = [
  { name: 'outputLifetimeDays', label: 'Days an unsaved Output is kept', help: 'Applies to Outputs generated from now on.' },
  { name: 'inputMaxMib', label: 'Maximum input file (MiB)', help: 'Uploads and Files a User sends to a Model.' },
  { name: 'templatePreviewMaxMib', label: 'Maximum Template preview image (MiB)', help: 'Checked when a Template is saved.' },
  { name: 'templateReferenceMaxMib', label: 'Maximum Template reference image (MiB)', help: 'Checked when a Template is saved.' },
];

/** The Studio's instance-wide limits: the default monthly Budget, how many Generations a User may run at once, and file lifetimes and sizes. */
export function StudioSettingsForm() {
  const { data: settings } = useSuspenseQuery(studioSettingsQueryOptions);
  const [budget, setBudget] = useState(settings.defaultMonthlyBudgetUsd === null ? '' : String(settings.defaultMonthlyBudgetUsd));
  const [activeLimit, setActiveLimit] = useState(String(settings.maxActiveGenerationsPerUser));
  const [fileValues, setFileValues] = useState<Record<FileSetting, string>>({
    outputLifetimeDays: String(settings.outputLifetimeDays),
    inputMaxMib: String(settings.inputMaxMib),
    templatePreviewMaxMib: String(settings.templatePreviewMaxMib),
    templateReferenceMaxMib: String(settings.templateReferenceMaxMib),
  });

  const save = useAppMutation(saveStudioSettings, {
    successMessage: 'Studio settings saved',
    invalidates: [queryKeys.adminStudio.settings, queryKeys.adminStudio.overview],
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save.mutate({
      defaultMonthlyBudgetUsd: budget.trim() === '' ? null : Number(budget),
      maxActiveGenerationsPerUser: Number(activeLimit),
      outputLifetimeDays: Number(fileValues.outputLifetimeDays),
      inputMaxMib: Number(fileValues.inputMaxMib),
      templatePreviewMaxMib: Number(fileValues.templatePreviewMaxMib),
      templateReferenceMaxMib: Number(fileValues.templateReferenceMaxMib),
    });
  };

  return (
    <div className="stack space-6">
      <div>
        <h1 className="cluster space-2 type-2xl weight-bold">
          <Settings2 className={styles.titleIcon} />
          Studio settings
        </h1>
        <p className={styles.muted}>Limits for every User. A User&apos;s own Budget is set on their page under Users.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Limits</CardTitle>
          <CardDescription>Budgets run per calendar month (UTC) and count billed costs, or estimates until fal has billed.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="stack space-4"
            onSubmit={onSubmit}
          >
            <div className="stack space-2">
              <Label htmlFor="studio-default-budget">Default monthly Budget (USD)</Label>
              <Input
                id="studio-default-budget"
                type="number"
                min="0"
                step="0.01"
                placeholder="Unlimited"
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
                disabled={save.isPending}
              />
              <p className={styles.muted}>Leave empty for no limit.</p>
            </div>
            <div className="stack space-2">
              <Label htmlFor="studio-active-limit">Maximum active Generations per User</Label>
              <Input
                id="studio-active-limit"
                type="number"
                min="1"
                max="50"
                step="1"
                required
                value={activeLimit}
                onChange={(event) => setActiveLimit(event.target.value)}
                disabled={save.isPending}
              />
            </div>
            {FILE_SETTINGS.map((field) => (
              <div
                key={field.name}
                className="stack space-2"
              >
                <Label htmlFor={`studio-${field.name}`}>{field.label}</Label>
                <Input
                  id={`studio-${field.name}`}
                  type="number"
                  step="1"
                  min={studioSettingsSchema.shape[field.name].minValue ?? undefined}
                  max={studioSettingsSchema.shape[field.name].maxValue ?? undefined}
                  required
                  value={fileValues[field.name]}
                  onChange={(event) => setFileValues((current) => ({ ...current, [field.name]: event.target.value }))}
                  disabled={save.isPending}
                />
                <p className={styles.muted}>{field.help}</p>
              </div>
            ))}
            <div>
              <Button
                type="submit"
                disabled={save.isPending}
              >
                Save settings
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
