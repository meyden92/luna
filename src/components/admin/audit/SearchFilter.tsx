import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import styles from './SearchFilter.module.css';

interface SearchFilterProps {
  currentSearch?: string;
  onDebouncedChangeAction: (value: string) => void;
  onImmediateChangeAction: (value: string | undefined) => void;
}

export default function SearchFilter({ currentSearch, onDebouncedChangeAction, onImmediateChangeAction }: SearchFilterProps) {
  const [searchValue, setSearchValue] = useState(currentSearch || '');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchValue(newValue);
    onDebouncedChangeAction(newValue);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onImmediateChangeAction(searchValue.trim() || undefined);
  };

  const handleClear = () => {
    setSearchValue('');
    onImmediateChangeAction(undefined);
  };

  useEffect(() => {
    setSearchValue(currentSearch || '');
  }, [currentSearch]);

  return (
    <form
      onSubmit={handleSubmit}
      className={styles.root}
    >
      <Input
        id="search-filter"
        type="text"
        placeholder="Search logs..."
        value={searchValue}
        onChange={handleChange}
        className={styles.input}
        aria-label="Search audit logs"
      />
      <Button
        type="submit"
        variant="secondary"
      >
        Search
      </Button>
      {currentSearch && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleClear}
          aria-label="Clear search"
        >
          <X />
        </Button>
      )}
    </form>
  );
}
