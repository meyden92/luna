import { useSuspenseQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { type StudioEntry, type StudioSelection, selectionOf } from '@/libs/studio/catalog';
import type { StudioFormValues } from '@/libs/studio/form';
import { CategoryIcon } from './category-icon';
import { EntryPicker } from './EntryPicker';
import { GeneratePanel } from './GeneratePanel';
import { studioCatalogQueryOptions } from './queries';
import { StudioHistory } from './StudioHistory';
import styles from './StudioScreen.module.css';

const entryKey = (entry: StudioEntry) => `${entry.kind}:${entry.id}`;

/**
 * The Studio: the Category bar on top; on the left the form of the selected
 * Model or Template, with the picker for the Category's other ones; the
 * history on the right (below the form on phones). The selection lives in the
 * URL.
 */
export function StudioScreen({ selection, onSelect }: { selection: StudioSelection; onSelect: (selection: StudioSelection) => void }) {
  const mainRef = useRef<HTMLElement>(null);
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

  /** Selects an entry with its form filled in: *Use settings* and *Continue with …*. */
  const open = (target: StudioEntry, values: StudioFormValues) => {
    setDraft({ key: entryKey(target), values });
    onSelect(selectionOf(target));
    // On phones the form is above the history, out of view from an entry further down.
    const main = mainRef.current;
    if (main && main.getBoundingClientRect().top < 0) main.scrollIntoView();
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
          ref={mainRef}
          className={styles.main}
          aria-label="Generate"
        >
          <GeneratePanel
            key={entryKey(entry)}
            entry={entry}
            values={draft?.key === entryKey(entry) ? draft.values : null}
            onChange={(values) => setDraft({ key: entryKey(entry), values })}
            picker={
              category.entries.length > 1 && (
                <EntryPicker
                  entries={category.entries}
                  selected={entry}
                  onSelect={(next) => onSelect(selectionOf(next))}
                />
              )
            }
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
