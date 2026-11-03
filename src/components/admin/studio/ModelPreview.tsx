import { useQuery } from '@tanstack/react-query';
import { FlaskConical } from 'lucide-react';
import { useMemo, useState } from 'react';
import { StudioForm } from '@/components/studio/form/StudioForm';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { queryKeys } from '@/libs/query-keys';
import { estimateCost } from '@/libs/studio/cost';
import { buildStudioForm, initialFormValues, type StudioFormValues, studioFormData } from '@/libs/studio/form';
import { sameValue } from '@/libs/studio/request';
import type { FieldConfig, JsonSchema, StudioPricing } from '@/libs/studio/types';
import type { OutputView } from '@/libs/studio/views';
import { testStudioModel } from '@/server/fns/admin/studio';
import { getGeneration } from '@/server/fns/studio';
import styles from './ModelPreview.module.css';

const POLL_MS = 1500;

/**
 * The Model editor's right side: the form Users will see for the unsaved
 * Fields, and *Test*, which runs it as a Generation of the admin's and shows
 * the Output here.
 */
export function ModelPreview({
  modelId,
  fields,
  schema,
  pricing,
  disabledReason,
}: {
  modelId: string;
  fields: FieldConfig[];
  schema: JsonSchema;
  pricing: StudioPricing | null;
  /** Why the current Fields cannot be tested, if they cannot. */
  disabledReason: string | null;
}) {
  const form = useMemo(() => buildStudioForm({ fields, schema }), [fields, schema]);
  const initial = useMemo(() => initialFormValues(form), [form]);
  // Only what the admin changed, so editing a default in a card shows here at once.
  const [changed, setChanged] = useState<StudioFormValues>({});
  const values = { ...initial, ...changed };
  const [generationId, setGenerationId] = useState<string | null>(null);

  const test = useAppMutation(testStudioModel, { onSuccess: (generation) => setGenerationId(generation.id) });
  const generation = useQuery({
    queryKey: queryKeys.studio.generation(generationId ?? ''),
    queryFn: () => getGeneration({ data: { id: generationId as string } }),
    enabled: generationId !== null,
    refetchInterval: (query) => (query.state.data && !['queued', 'running'].includes(query.state.data.status) ? false : POLL_MS),
  });
  const estimate = estimateCost(pricing, { ...form.context, ...values }, schema);
  const result = generation.data;

  return (
    <Card className={styles.card}>
      <CardHeader>
        <CardTitle>Preview</CardTitle>
        <CardDescription>The form exactly as Users see it in the Studio.</CardDescription>
      </CardHeader>
      <CardContent
        className="stack space-4"
        data-testid="studio-preview"
      >
        {form.items.length === 0 ? (
          <p className={styles.muted}>Users see no inputs: every Field is fixed or left to fal.</p>
        ) : (
          <StudioForm
            form={form}
            values={values}
            onChange={(next) =>
              setChanged(Object.fromEntries(Object.entries(next).filter(([name, value]) => !sameValue(value, initial[name]))))
            }
          />
        )}

        <div className={styles.footer}>
          {estimate !== null && <span className={styles.muted}>≈ ${estimate}</span>}
          <Button
            disabled={disabledReason !== null || test.isPending}
            title={disabledReason ?? undefined}
            onClick={() => test.mutate(studioFormData({ modelId, fields }, values))}
          >
            <FlaskConical />
            Test
          </Button>
        </div>
        {disabledReason && <p className={styles.muted}>{disabledReason}</p>}

        {result && (
          <div
            className="stack space-2"
            data-testid="studio-test-result"
          >
            <p className={styles.status}>
              {['queued', 'running'].includes(result.status) && <Spinner />}
              Test {result.status}
            </p>
            {result.error && (
              <Alert variant="destructive">
                <AlertDescription>{result.error.message}</AlertDescription>
              </Alert>
            )}
            <div className={styles.outputs}>
              {result.outputs.map((output) => (
                <OutputPreview
                  key={output.id}
                  output={output}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OutputPreview({ output }: { output: OutputView }) {
  if (!output.url) return <p className={styles.muted}>Output expired</p>;
  switch (output.mediaKind) {
    case 'image':
      return (
        <img
          src={output.url}
          alt={`Output ${output.index + 1}`}
          className={styles.output}
        />
      );
    case 'video':
      return (
        <video
          src={output.url}
          controls
          className={styles.output}
        />
      );
    case 'audio':
      return (
        <audio
          src={output.url}
          controls
        />
      );
    default:
      return (
        <a
          href={output.url}
          download
        >
          Download the 3D model
        </a>
      );
  }
}
