import type { ChangeEvent, KeyboardEvent } from 'react';
import { HighlightedCode } from '@/components/bin/CustomHighlighter';
import styles from './SnippetCodeArea.module.css';

// Mirrors the code area's own font-size/line-height and vertical padding (13px/21px,
// space-4 top and bottom) so the computed box height lines up with the gutter's line
// numbers. Not tokens — this is the one place those exact pixel values are spec'd.
const LINE_HEIGHT_PX = 21;
const VERTICAL_PADDING_PX = 32;
const MIN_LINES = 12;

interface SnippetCodeAreaProps {
  content: string;
  language: string;
  onChange: (content: string) => void;
}

/**
 * The editor's code surface: a line-number gutter plus a mono textarea with a
 * `CustomHighlighter`-rendered overlay behind it, so typed code is coloured
 * live. The textarea's own text is transparent — only its caret and native
 * selection paint on top of the highlighted copy underneath it.
 */
export function SnippetCodeArea({ content, language, onChange }: SnippetCodeAreaProps) {
  const lineCount = Math.max(content.split('\n').length, MIN_LINES);
  const boxHeight = lineCount * LINE_HEIGHT_PX + VERTICAL_PADDING_PX;
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value);

  // Tab moves focus everywhere else in the app; inside code it should indent instead.
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    onChange(`${content.slice(0, start)}  ${content.slice(end)}`);
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + 2;
    });
  };

  return (
    <div className={styles.root}>
      <div
        aria-hidden
        className={styles.gutter}
      >
        {lineNumbers}
      </div>
      <div
        className={styles.editArea}
        style={{ height: boxHeight }}
      >
        <HighlightedCode
          code={content}
          language={language}
          className={styles.highlight}
        />
        <textarea
          className={styles.textarea}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Paste or type code…"
          aria-label="Code"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
