import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { StudioForm } from '@/components/studio/form/StudioForm';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { queryKeys } from '@/libs/query-keys';
import type { StudioEntry } from '@/libs/studio/catalog';
import { estimateCost } from '@/libs/studio/cost';
import { buildStudioForm, formRequestValues, initialFormValues, type StudioFormValues, studioFormData } from '@/libs/studio/form';
import { budgetLabel, formatUsd } from '@/libs/studio/format';
import { submitGeneration } from '@/server/fns/studio';
import styles from './GeneratePanel.module.css';
import { studioBudgetQueryOptions } from './queries';

/**
 * The selected Model's or Template's form, and the footer with the price
 * estimate, the Budget and *Generate*. A refused submit (Budget, storage,
 * active limit, invalid input) shows its reason below the button. The footer
 * stays visible: a form taller than the card scrolls above it.
 */
export function GeneratePanel({
  entry,
  values: given,
  onChange,
  picker,
}: {
  entry: StudioEntry;
  /** Null starts from the form's defaults. */
  values: StudioFormValues | null;
  onChange: (values: StudioFormValues) => void;
  /** The control that selects another entry, shown beside the name. */
  picker?: ReactNode;
}) {
  const form = useMemo(() => buildStudioForm(entry), [entry]);
  const values = given ?? initialFormValues(form);
  const [refusal, setRefusal] = useState<string | null>(null);
  const budget = useQuery(studioBudgetQueryOptions);

  const submit = useAppMutation(submitGeneration, {
    errorMessage: false,
    invalidates: [queryKeys.studio.generationsAll, queryKeys.studio.budget],
    onSuccess: () => setRefusal(null),
    onError: (error) => setRefusal(error.message || 'The Generation could not be started.'),
  });

  const estimate = estimateCost(entry.pricing, formRequestValues(form, values), entry.schema);
  const target = entry.kind === 'model' ? { modelId: entry.id } : { templateId: entry.id };

  return (
    <Card className={styles.root}>
      <CardHeader className={styles.header}>
        <CardTitle
          role="heading"
          aria-level={2}
        >
          {entry.name}
        </CardTitle>
        <CardDescription className={styles.description}>
          {entry.kind === 'template' ? 'Template' : 'Model'}
          {entry.description && ` · ${entry.description}`}
        </CardDescription>
        {picker && <CardAction>{picker}</CardAction>}
      </CardHeader>
      <CardContent className={styles.body}>
        {form.items.length === 0 ? (
          <p className={styles.muted}>Nothing to fill in: press Generate.</p>
        ) : (
          <StudioForm
            form={form}
            values={values}
            onChange={(next) => {
              setRefusal(null);
              onChange(next);
            }}
            disabled={submit.isPending}
          />
        )}
      </CardContent>
      <div className={styles.footer}>
        <div className={styles.submit}>
          <div className={styles.cost}>
            {estimate !== null && <span data-testid="studio-estimate">≈ {formatUsd(estimate)}</span>}
            {budget.data && (
              <span
                className={styles.muted}
                data-testid="studio-budget"
              >
                {budgetLabel(budget.data)}
              </span>
            )}
          </div>
          <Button
            disabled={submit.isPending}
            onClick={() => submit.mutate(studioFormData(target, values))}
          >
            {submit.isPending ? <Spinner /> : <Sparkles />}
            Generate
          </Button>
        </div>
        {refusal && (
          <p
            role="alert"
            className={styles.refusal}
          >
            {refusal}
          </p>
        )}
      </div>
    </Card>
  );
}
