import { formatDistanceToNow } from 'date-fns';
import { Lock, Plus, Search } from 'lucide-react';
import type { Bin } from '@/components/bin/types';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import styles from './SnippetList.module.css';

interface SnippetListProps {
  bins: Bin[];
  activeId: string | null;
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

function matchesQuery(bin: Bin, query: string) {
  if (!query) return true;
  const haystack = `${bin.title ?? ''} ${bin.language ?? ''}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

/** The 300px snippet list: title, search, and the rows themselves. Selection stays live even while a search hides the active row. */
export function SnippetList({ bins, activeId, query, onQueryChange, onSelect, onCreate }: SnippetListProps) {
  const filtered = bins.filter((bin) => matchesQuery(bin, query));

  return (
    <aside className={styles.root}>
      <div className={styles.head}>
        <h1 className={styles.title}>Snippets</h1>
        <Button
          size="sm"
          onClick={onCreate}
        >
          <Plus />
          New
        </Button>
      </div>
      <InputGroup className={styles.search}>
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search snippets"
          aria-label="Search snippets"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </InputGroup>
      <div className={styles.rows}>
        {filtered.map((bin, index) => (
          <button
            key={bin.id}
            type="button"
            className={styles.row}
            // The rows rise in one after another rather than all at once.
            style={{ animationDelay: `${index * 40}ms` }}
            data-active={bin.id === activeId || undefined}
            onClick={() => onSelect(bin.id)}
          >
            <span className={styles.rowTitle}>
              {!bin.isPublic && (
                <Lock
                  size={12}
                  className={styles.lockIcon}
                />
              )}
              <span className={styles.rowTitleText}>{bin.title || 'Untitled'}</span>
            </span>
            <span className={styles.rowMeta}>
              <span className={styles.language}>{bin.language || 'text'}</span>
              {formatDistanceToNow(new Date(bin.updatedAt), { addSuffix: true })}
            </span>
          </button>
        ))}
        {filtered.length === 0 && query && <p className={styles.noMatches}>No snippets match “{query}”.</p>}
      </div>
    </aside>
  );
}
