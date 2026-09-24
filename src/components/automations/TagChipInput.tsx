import { X } from 'lucide-react';
import { useState } from 'react';
import { MAX_TAGS_PER_STEP } from '@/libs/flows/linear-flow';
import styles from './TagChipInput.module.css';

type TagChipInputProps = {
  tags: string[];
  onChange: (tags: string[]) => void;
};

/**
 * The tag field of an "Add tags" step: committed tags as removable chips, then a
 * bare input. Enter or a comma commits, Backspace on an empty input takes the
 * last chip back, and blurring commits whatever is half-typed so a tag is never
 * lost by clicking away.
 *
 * Tags are lowercased and de-duplicated here because that is how the runner
 * stores them (`mergeTags` in src/libs/flows/run-flow.ts).
 */
function TagChipInput({ tags, onChange }: TagChipInputProps) {
  const [draft, setDraft] = useState('');
  const full = tags.length >= MAX_TAGS_PER_STEP;

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
