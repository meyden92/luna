import { Check, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { JsonValue } from '@/db/schema/json';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { queryKeys } from '@/libs/query-keys';
import { correctSchemaApplyPlan, type FixedValueCorrections, invalidFixedFields, isApplyRefused } from '@/libs/studio/schema-apply';
import { applyStudioModelSchema, checkStudioModelSchema, type getStudioModel } from '@/server/fns/admin/studio';
import { ValueSetting } from './FieldCard';
import styles from './SchemaDriftCard.module.css';

type Model = Awaited<ReturnType<typeof getStudioModel>>;

const NO_CORRECTIONS: FixedValueCorrections = { model: {}, templates: {} };

/**
 * The Model's fal schema: when it was last checked, fal's deprecation, and
 * while fal's schema differs from the snapshot, what changed, which Field
 * configs and Templates use it and the *Apply* button. A fixed value the new
 * schema rejects gets a value editor here, since the editor validates against
 * the current snapshot. Apply works on the saved configuration, so it waits
 * while the editor has unsaved changes.
 */
export function SchemaDriftCard({ model, unsaved }: { model: Model; unsaved: boolean }) {
  const invalidates = [queryKeys.adminStudio.model(model.id), queryKeys.adminStudio.models, queryKeys.adminStudio.templates];
  const [corrections, setCorrections] = useState(NO_CORRECTIONS);
  const check = useAppMutation(checkStudioModelSchema, {
    invalidates,
    successMessage: ({ drifted, missing }) =>
      missing ? 'fal no longer lists this endpoint' : drifted ? "fal's schema differs from the snapshot" : "fal's schema is unchanged",
  });
  const apply = useAppMutation(applyStudioModelSchema, {
    invalidates,
    successMessage: 'Schema applied',
    onSuccess: () => setCorrections(NO_CORRECTIONS),
  });
  const { drift } = model;
  const after = model.pendingSchema?.input;
  const plan = drift && after ? correctSchemaApplyPlan(drift, corrections, { after, pricing: model.pricing }) : null;
  const refused = plan !== null && isApplyRefused(plan);

  // Taken from the plan before corrections, so an editor stays while its value is being fixed.
  const fixable = drift
    ? [
        ...invalidFixedFields(drift.model).map((field) => ({ where: 'This Model', templateId: null, field })),
        ...drift.templates.flatMap((template) =>
          invalidFixedFields(template).map((field) => ({ where: `Template ${template.name}`, templateId: template.id, field })),
        ),
      ]
    : [];
  const correctionOf = (templateId: string | null, name: string) =>
    (templateId === null ? corrections.model : corrections.templates[templateId])?.[name];
  const setCorrection = (templateId: string | null, name: string, value: JsonValue | undefined) =>
    setCorrections((current) => {
      const values = { ...(templateId === null ? current.model : current.templates[templateId]) };
      if (value === undefined) delete values[name];
      else values[name] = value;
      return templateId === null
        ? { ...current, model: values }
        : { ...current, templates: { ...current.templates, [templateId]: values } };
    });

  const affected = drift
    ? [
        ...(drift.model.affected.length > 0 ? [{ key: model.id, label: 'This Model', names: drift.model.affected }] : []),
        ...drift.templates
          .filter((template) => template.affected.length > 0)
          .map((template) => ({ key: template.id, label: `Template ${template.name}`, names: template.affected })),
      ]
    : [];
  const issues = plan
    ? [
        ...plan.model.issues.map((issue) => ({ where: 'This Model', ...issue })),
        ...plan.templates.flatMap((template) => template.issues.map((issue) => ({ where: `Template ${template.name}`, ...issue }))),
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
            <AlertDescription>
              fal marks this endpoint as deprecated or no longer lists it. Its Generations fail once fal removes it.
            </AlertDescription>
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

            {(issues.length > 0 || fixable.length > 0) && (
              <div className="stack space-2">
                <h3 className="weight-semibold">Fix before applying</h3>
                {issues.length > 0 && (
                  <ul className={styles.issues}>
                    {issues.map((issue) => (
                      <li key={`${issue.where}-${issue.field}-${issue.message}`}>
                        {issue.where}, {issue.field}: {issue.message}
                      </li>
                    ))}
                  </ul>
                )}
                {fixable.map(({ where, templateId, field }) => (
                  <div
                    key={`${where}-${field.name}`}
                    className="stack space-1"
                  >
                    <ValueSetting
                      field={{ ...field, value: correctionOf(templateId, field.name) }}
                      property={after?.properties?.[field.name] ?? {}}
                      label={`${where}, ${field.name}: new fixed value`}
                      onChange={(value) => setCorrection(templateId, field.name, value)}
                    />
                    <p className={styles.muted}>Fixed now: {JSON.stringify(field.value)}</p>
                  </div>
                ))}
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
              onClick={() => apply.mutate({ id: model.id, corrections })}
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
