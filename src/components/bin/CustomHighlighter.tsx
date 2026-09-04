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

export default function CodeBlock({ code, language = 'text' }: CodeBlockProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const theme = mounted && resolvedTheme === 'dark' ? themes.vsDark : themes.github;

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
