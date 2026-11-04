import { type KeyboardEvent, useRef, useState } from 'react';
import { Label } from '@/components/ui/label';
import { tokenSegments } from '@/libs/studio/variables';
import fieldStyles from './FieldCard.module.css';
import styles from './TemplateTextEditor.module.css';

/** The `{name` being typed right before the caret, if any. */
const PARTIAL = /\{([a-z0-9_]*)$/;

/**
 * A Template's fixed text, in monospace with its `{variables}` highlighted.
 * Typing `{` offers the existing Variable names; Tab or Enter takes the
 * first, a click any.
 */
export function TemplateTextEditor({
  id,
  label,
  value,
  names,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  /** The Template's Variable names, to complete. */
  names: string[];
  onChange: (value: string) => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState<number | null>(null);
  const partial = caret === null ? undefined : PARTIAL.exec(value.slice(0, caret))?.[1];
  const suggestions = partial === undefined ? [] : names.filter((name) => name.startsWith(partial) && name !== partial);

  const complete = (name: string) => {
    if (caret === null || partial === undefined) return;
    const start = caret - partial.length;
    const next = `${value.slice(0, start)}${name}}${value.slice(caret)}`;
    const at = start + name.length + 1;
    onChange(next);
    setCaret(at);
    requestAnimationFrame(() => input.current?.setSelectionRange(at, at));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const [first] = suggestions;
    if (first && (event.key === 'Tab' || event.key === 'Enter')) {
      event.preventDefault();
      complete(first);
    } else if (event.key === 'Escape') setCaret(null);
  };

  return (
    <div className={fieldStyles.setting}>
      <Label htmlFor={id}>{label}</Label>
      <div className={styles.editor}>
        <pre
          aria-hidden
          className={styles.highlight}
        >
          {tokenSegments(value).map((segment) =>
            segment.token ? (
              <mark
                key={segment.start}
                className={styles.token}
              >
                {segment.text}
              </mark>
            ) : (
              <span key={segment.start}>{segment.text}</span>
            ),
          )}
          {/* A trailing newline only takes up a line when something follows it. */}{' '}
        </pre>
        <textarea
          ref={input}
          id={id}
          className={styles.input}
          value={value}
          spellCheck={false}
          onChange={(event) => {
            onChange(event.target.value);
            setCaret(event.target.selectionStart);
          }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
          onBlur={() => setCaret(null)}
          onKeyDown={onKeyDown}
        />
      </div>
      {suggestions.length > 0 && (
        <ul
          className={styles.suggestions}
          aria-label="Variable suggestions"
        >
          {suggestions.map((name, index) => (
            <li key={name}>
              <button
                type="button"
                className={styles.suggestion}
                data-first={index === 0 || undefined}
                // Keeps the textarea focused, so the caret stays where the name goes.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => complete(name)}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
