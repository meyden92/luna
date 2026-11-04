import { Check, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { queryKeys } from '@/libs/query-keys';
import { isApplyRefused } from '@/libs/studio/schema-apply';
import { applyStudioModelSchema, checkStudioModelSchema, type getStudioModel } from '@/server/fns/admin/studio';
import styles from './SchemaDriftCard.module.css';

type Model = Awaited<ReturnType<typeof getStudioModel>>;

/**
 * The Model's fal schema: when it was last checked, fal's deprecation, and
 * while fal's schema differs from the snapshot, what changed, which Field
 * configs and Templates use it and the *Apply* button. Apply works on the
 * saved configuration, so it waits while the editor has unsaved changes.
 */
export function SchemaDriftCard({ model, unsaved }: { model: Model; unsaved: boolean }) {
  const invalidates = [queryKeys.adminStudio.model(model.id), queryKeys.adminStudio.models, queryKeys.adminStudio.templates];
  const check = useAppMutation(checkStudioModelSchema, {
    invalidates,
    successMessage: ({ drifted }) => (drifted ? "fal's schema differs from the snapshot" : "fal's schema is unchanged"),
  });
  const apply = useAppMutation(applyStudioModelSchema, { invalidates, successMessage: 'Schema applied' });
  const { drift } = model;
  const refused = drift !== null && isApplyRefused(drift);

  const affected = drift
    ? [
        ...(drift.model.affected.length > 0 ? [{ key: model.id, label: 'This Model', names: drift.model.affected }] : []),
        ...drift.templates
          .filter((template) => template.affected.length > 0)
          .map((template) => ({ key: template.id, label: `Template ${template.name}`, names: template.affected })),
      ]
    : [];
  const issues = drift
    ? [
        ...drift.model.issues.map((issue) => ({ where: 'This Model', ...issue })),
        ...drift.templates.flatMap((template) => template.issues.map((issue) => ({ where: `Template ${template.name}`, ...issue }))),
      ]
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>fal schema</CardTitle>
        <CardDescription>
          {model.schemaCheckedAt ? `Last checked ${new Date(model.schemaCheckedAt).toLocaleString()}.` : 'Not checked yet.'} fal can change
          an endpoint's inputs at any time; a daily check compares them with this Model's snapshot.
        </CardDescription>
      </CardHeader>
      <CardContent className="stack space-4">
        {model.deprecated && (
          <Alert>
            <AlertTitle>Deprecated</AlertTitle>
            <AlertDescription>fal marks this endpoint as deprecated. It keeps working until fal removes it.</AlertDescription>
          </Alert>
        )}

        {drift && (
          <section
            aria-label="Schema changes"
            className="stack space-4"
          >
            <div className="stack space-2">
              <h3 className="weight-semibold">fal's schema changed</h3>
              <ul className={styles.list}>
                {drift.changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            </div>

            <div className="stack space-2">
              <h3 className="weight-semibold">Affected</h3>
              {affected.length > 0 ? (
                <ul className={styles.list}>
                  {affected.map(({ key, label, names }) => (
                    <li key={key}>
                      {label}: {names.join(', ')}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.muted}>No Field config or Template uses what changed.</p>
              )}
            </div>

            <p className={styles.muted}>
              Apply makes this the Model's schema: removed inputs lose their Field cards, new ones are left to fal's default, and options
              that no longer exist are taken out of narrowed lists, in this Model and its Templates.
            </p>

            {issues.length > 0 && (
              <div className="stack space-2">
                <h3 className="weight-semibold">Fix before applying</h3>
                <ul className={styles.issues}>
                  {issues.map((issue) => (
                    <li key={`${issue.where}-${issue.field}-${issue.message}`}>
                      {issue.where}, {issue.field}: {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        <div className="cluster space-2">
          <Button
            variant="outline"
            disabled={check.isPending}
            onClick={() => check.mutate({ id: model.id })}
          >
            <RefreshCw />
            Check now
          </Button>
          {drift && (
            <Button
              disabled={refused || unsaved || apply.isPending}
              onClick={() => apply.mutate({ id: model.id })}
            >
              <Check />
              Apply
            </Button>
          )}
          {drift && unsaved && <span className={styles.muted}>Save your changes first.</span>}
        </div>
      </CardContent>
    </Card>
  );
}
