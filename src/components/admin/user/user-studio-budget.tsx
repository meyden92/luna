import { useQuery } from '@tanstack/react-query';
import { CircleDollarSign } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { userStudioBudgetQueryOptions } from '@/components/admin/studio/queries';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Segmented } from '@/components/ui/segmented';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { queryKeys } from '@/libs/query-keys';
import { budgetLabel, formatUsd } from '@/libs/studio/format';
import { setUserStudioBudget } from '@/server/fns/admin/studio-budgets';
import styles from './user-storage-info.module.css';

type Mode = 'default' | 'unlimited' | 'amount';

const MODES = [
  { value: 'default', label: 'Default' },
  { value: 'unlimited', label: 'Unlimited' },
  { value: 'amount', label: 'Own amount' },
] as const;

/** A User's monthly Studio Budget: the default, unlimited or their own amount, with this month's spend. */
export default function UserStudioBudget({ userId }: { userId: string }) {
  const { data } = useQuery(userStudioBudgetQueryOptions(userId));
  const [mode, setMode] = useState<Mode>('default');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (!data) return;
    setMode(data.setting.mode);
    setAmount(data.setting.mode === 'amount' ? String(data.setting.amountUsd) : '');
  }, [data]);

  const save = useAppMutation(setUserStudioBudget, {
    successMessage: 'Studio Budget saved',
    invalidates: [queryKeys.adminStudio.userBudget(userId), queryKeys.adminStudio.overview],
  });

  if (!data) return null;
  const defaultLabel = data.defaultMonthlyBudgetUsd === null ? 'unlimited' : formatUsd(data.defaultMonthlyBudgetUsd);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save.mutate(mode === 'amount' ? { userId, mode, amountUsd: Number(amount) } : { userId, mode });
  };

  return (
    <Card>
      <CardContent className={styles.body}>
        <h3 className={styles.heading}>
          <CircleDollarSign className={styles.headingIcon} />
          Studio Budget
        </h3>
        <form
          className="stack space-4"
          onSubmit={onSubmit}
        >
          <div className={styles.usageHead}>
            <Label className={styles.fieldLabel}>Spent this month</Label>
            <span
              className={styles.usageValue}
              data-testid="user-studio-spend"
            >
              {budgetLabel(data.budget)}
            </span>
          </div>
          <Segmented
            label="Monthly Budget"
            items={MODES}
            value={mode}
            onValueChange={setMode}
          />
          {mode === 'default' && <p className={styles.unitHint}>The default Budget is {defaultLabel}.</p>}
          {mode === 'amount' && (
            <div className="stack space-2">
              <Label
                htmlFor="user-studio-budget"
                className={styles.fieldLabel}
              >
                Monthly Budget (USD)
              </Label>
              <Input
                id="user-studio-budget"
                type="number"
                min="0"
                step="0.01"
                required
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                disabled={save.isPending}
              />
            </div>
          )}
          <div>
            <Button
              type="submit"
              variant="secondary"
              disabled={save.isPending}
            >
              Save Budget
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
