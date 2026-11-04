import { useSuspenseQuery } from '@tanstack/react-query';
import { Settings2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { queryKeys } from '@/libs/query-keys';
import { saveStudioSettings } from '@/server/fns/admin/studio-budgets';
import styles from './ModelList.module.css';
import { studioSettingsQueryOptions } from './queries';

/** The Studio's instance-wide limits: the default monthly Budget and how many Generations a User may run at once. */
export function StudioSettingsForm() {
  const { data: settings } = useSuspenseQuery(studioSettingsQueryOptions);
  const [budget, setBudget] = useState(settings.defaultMonthlyBudgetUsd === null ? '' : String(settings.defaultMonthlyBudgetUsd));
  const [activeLimit, setActiveLimit] = useState(String(settings.maxActiveGenerationsPerUser));

  const save = useAppMutation(saveStudioSettings, {
    successMessage: 'Studio settings saved',
    invalidates: [queryKeys.adminStudio.settings, queryKeys.adminStudio.overview],
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save.mutate({
      defaultMonthlyBudgetUsd: budget.trim() === '' ? null : Number(budget),
      maxActiveGenerationsPerUser: Number(activeLimit),
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
