import { useSuspenseQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type StudioEntry, type StudioSelection, selectionOf } from '@/libs/studio/catalog';
import type { StudioFormValues } from '@/libs/studio/form';
import { formatPrice } from '@/libs/studio/format';
import { cn } from '@/libs/utils';
import { CategoryIcon } from './category-icon';
import { GeneratePanel } from './GeneratePanel';
import { studioCatalogQueryOptions } from './queries';
import { StudioHistory } from './StudioHistory';
import styles from './StudioScreen.module.css';

const entryKey = (entry: StudioEntry) => `${entry.kind}:${entry.id}`;

/**
 * The Studio: the Category bar on top; on the left the selected Category's
 * Models in one dropdown, its Templates as picture cards in their own
 * section, and the form below them; the history on the right (below the form
 * on phones). The selection lives in the URL.
 */
export function StudioScreen({ selection, onSelect }: { selection: StudioSelection; onSelect: (selection: StudioSelection) => void }) {
  const id = useId();
  const { data: catalog } = useSuspenseQuery(studioCatalogQueryOptions);
  // The form's values, for the entry they were entered for; any other entry starts from its defaults.
  const [draft, setDraft] = useState<{ key: string; values: StudioFormValues } | null>(null);

  const category = catalog.find((candidate) => candidate.id === selection.category) ?? catalog[0];
  const entry =
    category?.entries.find((candidate) =>
      selection.template
        ? candidate.kind === 'template' && candidate.id === selection.template
        : candidate.kind === 'model' && candidate.id === selection.model,
    ) ?? category?.entries[0];
  const models = category?.entries.filter((candidate) => candidate.kind === 'model') ?? [];
  const templates = category?.entries.filter((candidate) => candidate.kind === 'template') ?? [];

  /** Selects an entry with its form filled in: *Use settings* and *Continue with …*. */
  const open = (target: StudioEntry, values: StudioFormValues) => {
    setDraft({ key: entryKey(target), values });
    onSelect(selectionOf(target));
  };

  if (!category || !entry) {
    return (
      <div className="container pad-y-8">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nothing to generate yet</EmptyTitle>
            <EmptyDescription>An admin adds Categories and Models to the Studio first.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div
        className={styles.categories}
        role="toolbar"
        aria-label="Categories"
      >
        {catalog.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            className={styles.category}
            aria-pressed={candidate.id === category.id}
            onClick={() => onSelect({ category: candidate.id })}
          >
            <CategoryIcon
              name={candidate.icon}
              size={16}
            />
            {candidate.name}
          </button>
        ))}
      </div>

      <div className={styles.columns}>
        <section
          className={styles.main}
          aria-label="Generate"
        >
          {models.length > 0 && (
            <div className={styles.model}>
              <Label htmlFor={`${id}-model`}>Model</Label>
              <Select
                items={models.map((candidate) => ({ value: candidate.id, label: candidate.name }))}
                value={entry.kind === 'model' ? entry.id : null}
                onValueChange={(modelId) => {
                  const next = models.find((candidate) => candidate.id === modelId);
                  if (next) onSelect(selectionOf(next));
                }}
              >
                <SelectTrigger id={`${id}-model`}>
                  <SelectValue placeholder="Choose a model…" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((candidate) => (
                    <SelectItem
                      key={candidate.id}
                      value={candidate.id}
                    >
                      {candidate.name}
                      {candidate.pricing && <span className={styles.price}> · {formatPrice(candidate.pricing)}</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {templates.length > 0 && (
            <div className={styles.templates}>
              <div>
                <h2 className={styles.sectionTitle}>Templates</h2>
                <p className={styles.sectionHelp}>Ready-made setups: fill in a few blanks instead of writing the whole prompt.</p>
              </div>
              <div
                className={styles.entries}
                role="toolbar"
                aria-label="Templates"
              >
                {templates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    className={cn(styles.entry, candidate.previewUrls.length > 0 && styles.withPreview)}
                    aria-pressed={entryKey(candidate) === entryKey(entry)}
                    onClick={() => onSelect(selectionOf(candidate))}
                  >
                    {candidate.previewUrls[0] && (
                      <img
                        src={candidate.previewUrls[0]}
                        alt=""
                        className={styles.preview}
                      />
                    )}
                    <span className={styles.entryName}>{candidate.name}</span>
                    {candidate.description && <span className={styles.entryDescription}>{candidate.description}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <GeneratePanel
            key={entryKey(entry)}
            entry={entry}
            values={draft?.key === entryKey(entry) ? draft.values : null}
            onChange={(values) => setDraft({ key: entryKey(entry), values })}
          />
        </section>

        <StudioHistory
          catalog={catalog}
          onOpen={open}
        />
      </div>
    </div>
  );
}
