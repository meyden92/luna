import { LayoutTemplate } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { StudioEntry } from '@/libs/studio/catalog';
import { formatPrice } from '@/libs/studio/format';
import styles from './EntryPicker.module.css';

/** The button and dialog that choose one of a Category's Models and Templates. */
export function EntryPicker({
  entries,
  selected,
  onSelect,
}: {
  entries: StudioEntry[];
  selected: StudioEntry;
  onSelect: (entry: StudioEntry) => void;
}) {
  const [open, setOpen] = useState(false);
  const models = entries.filter((entry) => entry.kind === 'model');
  const templates = entries.filter((entry) => entry.kind === 'template');

  const choose = (entry: StudioEntry) => {
    setOpen(false);
    onSelect(entry);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
    >
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
          />
        }
      >
        Change
      </DialogTrigger>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Choose a Model or Template</DialogTitle>
        </DialogHeader>
        <div className={styles.body}>
          {models.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Models</h3>
              <div className={styles.models}>
                {models.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={styles.model}
                    aria-pressed={entry === selected}
                    onClick={() => choose(entry)}
                  >
                    <span className={styles.name}>{entry.name}</span>
                    {entry.pricing && <span className={styles.price}>{formatPrice(entry.pricing)}</span>}
                    {entry.description && <span className={styles.description}>{entry.description}</span>}
                  </button>
                ))}
              </div>
            </section>
          )}
          {templates.length > 0 && (
            <section className={styles.section}>
              <div>
                <h3 className={styles.sectionTitle}>Templates</h3>
                <p className={styles.sectionHelp}>Ready-made setups: fill in a few blanks instead of writing the whole prompt.</p>
              </div>
              <div className={styles.templates}>
                {templates.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={styles.template}
                    aria-pressed={entry === selected}
                    onClick={() => choose(entry)}
                  >
                    {entry.previewUrls[0] ? (
                      <img
                        src={entry.previewUrls[0]}
                        alt=""
                        className={styles.preview}
                      />
                    ) : (
                      <span className={styles.preview}>
                        <LayoutTemplate aria-hidden />
                      </span>
                    )}
                    <span className={styles.name}>{entry.name}</span>
                    {entry.description && <span className={styles.description}>{entry.description}</span>}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
