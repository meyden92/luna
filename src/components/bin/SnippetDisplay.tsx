import { Badge } from '@/components/ui/badge';
import CodeBlock from './CustomHighlighter';
import styles from './SnippetDisplay.module.css';

export interface SnippetDisplayData {
  title: string;
  content: string;
  language: string | null;
}

export function SnippetDisplay({ snippet }: { snippet: SnippetDisplayData | null }) {
  if (!snippet) {
    return (
      <div>
        <h2>Snippet not found</h2>
      </div>
    );
  }

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>{snippet.title}</h1>
        {snippet.language && <Badge variant="secondary">{snippet.language}</Badge>}
      </div>
      <CodeBlock
        language={snippet.language || 'text'}
        code={snippet.content}
      />
    </div>
  );
}
