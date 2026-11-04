import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { Ban, Download, FolderInput, LayoutTemplate, RefreshCw, Repeat, SlidersHorizontal, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { useConfirmation } from '@/hooks/use-confirmation';
import { queryKeys } from '@/libs/query-keys';
import { findEntry, type StudioCatalogCategory, type StudioEntry } from '@/libs/studio/catalog';
import { buildStudioForm, initialFormValues, type StudioFormValues } from '@/libs/studio/form';
import { expiryLabel, formatUsd } from '@/libs/studio/format';
import { attachOutput, continueTargets } from '@/libs/studio/history-actions';
import type { GenerationView, OutputView } from '@/libs/studio/views';
import { checkCurrentUserIsAdmin } from '@/server/fns/rbac';
import {
  cancelGeneration,
  deleteGeneration,
  getGenerationSettings,
  getOutputDownloadUrl,
  retryGeneration,
  saveOutputToFiles,
} from '@/server/fns/studio';
import styles from './HistoryEntry.module.css';
import { OutputViewer } from './OutputViewer';

const STATUS_LABEL: Record<GenerationView['status'], string> = {
  queued: 'Queued',
  running: 'Running',
  succeeded: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

type OpenEntry = (entry: StudioEntry, values: StudioFormValues) => void;

/** One Generation in the history: what ran, its state and cost, its Outputs, and the actions on it. */
export function HistoryEntry({
  generation,
  catalog,
  onOpen,
}: {
  generation: GenerationView;
  catalog: StudioCatalogCategory[];
  onOpen: OpenEntry;
}) {
  const active = generation.status === 'queued' || generation.status === 'running';
  // The admin layout's own check: super admins and RBAC admins alike.
  const isAdmin =
    useQuery({ queryKey: queryKeys.adminRbac.currentUserIsAdmin, queryFn: () => checkCurrentUserIsAdmin(), staleTime: 30_000 }).data ===
    true;
  const confirm = useConfirmation<null>();
  const resubmitted = { invalidates: [queryKeys.studio.generationsAll, queryKeys.studio.budget] };
  const cancel = useAppMutation(cancelGeneration);
  const retry = useAppMutation(retryGeneration, resubmitted);
  const remove = useAppMutation(deleteGeneration, { invalidates: [queryKeys.studio.generationsAll], successMessage: 'Generation deleted' });
  const cost = generation.actualCostUsd ?? generation.estimatedCostUsd;
  const expiry = expiryLabel(generation.outputs);

  const applySettings = async () => {
    try {
      const settings = await getGenerationSettings({ data: { id: generation.id } });
      const entry = findEntry(catalog, settings);
      if (!entry) {
        toast.error('The Model of this Generation is no longer available.');
        return;
      }
      onOpen(entry, { ...initialFormValues(buildStudioForm(entry)), ...settings.values });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The settings could not be loaded.');
    }
  };

  return (
    <article
      className={styles.root}
      aria-label={generation.name}
      data-status={generation.status}
    >
      <header className={styles.header}>
        <div className={styles.title}>
          <strong>{generation.name}</strong>
          <span className={styles.meta}>
            {formatDistanceToNow(new Date(generation.createdAt), { addSuffix: true })}
            {cost !== null && ` · ${generation.actualCostUsd === null ? '≈ ' : ''}${formatUsd(cost)}`}
            {expiry && ` · ${expiry}`}
          </span>
        </div>
        <Badge variant={generation.status === 'failed' ? 'destructive' : 'secondary'}>
          {active && <Spinner />}
          {STATUS_LABEL[generation.status]}
          {generation.status === 'queued' && generation.progress?.queuePosition ? ` (#${generation.progress.queuePosition + 1})` : ''}
        </Badge>
      </header>

      {generation.prompt && <p className={styles.prompt}>{generation.prompt}</p>}
      {generation.error && <p className={styles.error}>{generation.error.message}</p>}

      {generation.outputs.length > 0 && (
        <div className={styles.outputs}>
          {generation.outputs.map((output) => (
            <figure
              key={output.id}
              className={styles.output}
            >
              <OutputViewer output={output} />
              {output.url && (
                <OutputActions
                  generation={generation}
                  output={output}
                  catalog={catalog}
                  onOpen={onOpen}
                />
              )}
            </figure>
          ))}
        </div>
      )}

      <footer className={styles.actions}>
        {active && (
          <Button
            variant="outline"
            size="sm"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate({ id: generation.id })}
          >
            <Ban />
            Cancel
          </Button>
        )}
        {generation.status === 'failed' && (
          <Button
            variant="outline"
            size="sm"
            disabled={retry.isPending}
            onClick={() => retry.mutate({ id: generation.id })}
          >
            <RefreshCw />
            Retry
          </Button>
        )}
        {!active && generation.status !== 'failed' && (
          <Button
            variant="outline"
            size="sm"
            disabled={retry.isPending}
            onClick={() => retry.mutate({ id: generation.id, reseed: true })}
          >
            <Repeat />
            Again
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void applySettings()}
        >
          <SlidersHorizontal />
          Use settings
        </Button>
        {isAdmin && generation.status === 'succeeded' && (
          <Link
            to="/admin/studio/templates/new"
            search={{ from: generation.id }}
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            <LayoutTemplate />
            Save as Template
          </Link>
        )}
        {!active && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete"
            disabled={remove.isPending}
            onClick={() =>
              confirm.confirm({
                title: 'Delete this Generation?',
                description: 'Its Outputs are deleted too. Outputs saved to Files stay there.',
                data: null,
                onConfirm: () => remove.mutate({ id: generation.id }),
              })
            }
          >
            <Trash2 />
          </Button>
        )}
      </footer>
      <confirm.ConfirmationDialog />
    </article>
  );
}

/** Save to Files, Download and *Continue with …* for one Output. */
function OutputActions({
  generation,
  output,
  catalog,
  onOpen,
}: {
  generation: GenerationView;
  output: OutputView;
  catalog: StudioCatalogCategory[];
  onOpen: OpenEntry;
}) {
  const queryClient = useQueryClient();
  const save = useAppMutation(saveOutputToFiles, {
    invalidates: [queryKeys.gallery.all, queryKeys.studio.generationsAll],
    successMessage: 'Saved to Files',
  });
  const targets = continueTargets(catalog, output.mediaKind);
  const label = generation.outputs.length > 1 ? ` output ${output.index + 1}` : '';

  const download = async () => {
    try {
      const { url } = await getOutputDownloadUrl({ data: { outputId: output.id } });
      window.location.assign(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The download could not be started.');
    }
  };

  return (
    <figcaption className={styles.outputActions}>
      {output.savedFileId ? (
        <Link
          to="/dashboard"
          search={{ file: output.savedFileId }}
          className={styles.saved}
        >
          Saved to Files
        </Link>
      ) : (
        <Button
          variant="ghost"
          size="xs"
          disabled={save.isPending}
          onClick={() =>
            save.mutate({ outputId: output.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.storage.usage }) })
          }
        >
          <FolderInput />
          Save to Files
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Download${label}`}
        onClick={() => void download()}
      >
        <Download />
      </Button>
      {targets.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="xs"
              />
            }
          >
            <Wand2 />
            Continue with…
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Continue with</DropdownMenuLabel>
              {targets.map(({ category, entry, field }) => (
                <DropdownMenuItem
                  key={category.id}
                  onClick={() => {
                    const form = buildStudioForm(entry);
                    onOpen(entry, attachOutput(form, initialFormValues(form), field, { source: 'output', outputId: output.id }));
                  }}
                >
                  {category.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </figcaption>
  );
}
