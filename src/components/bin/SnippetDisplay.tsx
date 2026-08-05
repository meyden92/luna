import { Badge } from '@/components/ui/badge';
import CodeBlock from './CustomHighlighter';

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
      <div className="flex items-center justify-center gap-3 mb-6">
        <h1 className="text-center text-3xl font-bold dark:text-primary">{snippet.title}</h1>
        {snippet.language && <Badge variant="secondary">{snippet.language}</Badge>}
      </div>
      <CodeBlock
        language={snippet.language || 'text'}
        code={snippet.content}
      />
    </div>
  );
}
