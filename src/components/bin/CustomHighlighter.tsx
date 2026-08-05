import { Check, ClipboardCopy } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Highlight, themes } from 'prism-react-renderer';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

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
    <div className="relative">
      <Button
        onClick={copyToClipboard}
        className="absolute top-2 right-2"
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
            className={`${className} p-4 rounded-lg overflow-auto`}
            style={style}
          >
            {tokens.map((line, lineIdx) => {
              const lineKey = lineIdx;
              return (
                <div
                  key={lineKey}
                  {...getLineProps({ line })}
                  className="table-row"
                >
                  <span className="table-cell text-right pr-4 select-none opacity-50">{lineIdx + 1}</span>
                  <span className="table-cell">
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
