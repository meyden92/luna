import { X } from 'lucide-react';
import { useState } from 'react';
import styles from './TagChipInput.module.css';

type TagChipInputProps = {
  tags: string[];
  onChange: (tags: string[]) => void;
  /** No more tags can be added past this many; unlimited when absent. */
  max?: number;
};

/**
 * A tag field: committed tags as removable chips, then a bare input. Used by an
 * automation's "Add tags" step and the Preview's tag row. Enter or a comma commits, Backspace on an empty input takes the
 * last chip back, and blurring commits whatever is half-typed so a tag is never
 * lost by clicking away.
 *
 * Tags are lowercased and de-duplicated here because that is how the runner
 * stores them (`mergeTags` in src/libs/flows/run-flow.ts).
 */
function TagChipInput({ tags, onChange, max }: TagChipInputProps) {
  const [draft, setDraft] = useState('');
  const full = max !== undefined && tags.length >= max;

  const commit = () => {
    const tag = draft.trim().toLowerCase();
    setDraft('');
    if (!tag || full || tags.includes(tag)) return;
    onChange([...tags, tag]);
  };

  return (
    <div className={styles.root}>
      {tags.map((tag) => (
        <span
          key={tag}
          className={styles.chip}
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            className={styles.remove}
            onClick={() => onChange(tags.filter((candidate) => candidate !== tag))}
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        aria-label="Add a tag"
        className={styles.input}
        placeholder={full ? '' : 'Add tag, press Enter'}
        readOnly={full}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            commit();
            return;
          }
          if (event.key === 'Backspace' && !draft && tags.length) onChange(tags.slice(0, -1));
        }}
      />
    </div>
  );
}

export { TagChipInput };
