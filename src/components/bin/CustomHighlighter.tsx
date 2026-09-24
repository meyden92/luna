import { Check, ClipboardCopy } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Highlight, themes } from 'prism-react-renderer';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import styles from './CustomHighlighter.module.css';

interface CodeBlockProps {
  code: string;
  language?: string;
}

/** The prism-react-renderer theme for the active Appearance, resolved once mounted so SSR doesn't guess the OS theme. */
function useHighlightTheme() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted && resolvedTheme === 'dark' ? themes.vsDark : themes.github;
}

/**
 * Colour-only token rendering shared with the read-only `CodeBlock` below.
 * The Snippets editor layers this behind a transparent, editable textarea for a
 * live highlighted overlay, so it takes no background or padding of its own —
 * the caller owns the box, gutter and line numbers.
 */
export function HighlightedCode({ code, language = 'text', className }: CodeBlockProps & { className?: string }) {
  const theme = useHighlightTheme();

  return (
    <Highlight
      theme={theme}
      code={code}
      language={language}
    >
      {({ className: prismClassName, tokens, getLineProps, getTokenProps }) => (
        <pre className={`${prismClassName} ${styles.overlayPre}${className ? ` ${className}` : ''}`}>
          {tokens.map((line, lineIdx) => {
            const lineKey = lineIdx;
            return (
              <div
                key={lineKey}
                {...getLineProps({ line })}
                className={styles.overlayLine}
              >
                {line.map((token, tokenIdx) => {
                  const tokenKey = tokenIdx;
                  return (
                    <span
                      key={tokenKey}
                      {...getTokenProps({ token })}
                    />
                  );
                })}
              </div>
            );
          })}
        </pre>
      )}
    </Highlight>
  );
}

export default function CodeBlock({ code, language = 'text' }: CodeBlockProps) {
  const theme = useHighlightTheme();
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={styles.root}>
      <Button
        onClick={copyToClipboard}
        className={styles.copyButton}
        aria-label="Copy code"
        title="Copy code to clipboard"
      >
        {copied ? <Check size={16} /> : <ClipboardCopy size={16} />}
      </Button>
      <Highlight
        theme={theme}
        code={code}
        language={language}
      >
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={`${className} ${styles.pre}`}
            style={style}
          >
            {tokens.map((line, lineIdx) => {
              const lineKey = lineIdx;
              return (
                <div
                  key={lineKey}
                  {...getLineProps({ line })}
                  className={styles.line}
                >
                  <span className={styles.lineNumber}>{lineIdx + 1}</span>
                  <span className={styles.lineContent}>
                    {line.map((token, tokenIdx) => {
                      const tokenKey = tokenIdx;
                      return (
                        <span
                          key={tokenKey}
                          {...getTokenProps({ token })}
                        />
                      );
                    })}
                  </span>
                </div>
              );
            })}
          </pre>
        )}
      </Highlight>
    </div>
  );
}
