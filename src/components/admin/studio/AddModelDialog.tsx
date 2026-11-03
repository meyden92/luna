import { useInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { useDebounce } from '@/hooks/use-debounce';
import { queryKeys } from '@/libs/query-keys';
import { formatPrice } from '@/libs/studio/format';
import { CATALOG_CATEGORIES } from '@/libs/studio/model-config';
import { addStudioModel, type CatalogEntry, searchStudioCatalog } from '@/server/fns/admin/studio';
import styles from './AddModelDialog.module.css';
import { studioCategoriesQueryOptions } from './queries';

type CatalogCategory = (typeof CATALOG_CATEGORIES)[number];

/** Searches fal's catalog; choosing a result, a Category and a name adds it as a Model and opens its editor. */
export function AddModelDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<CatalogCategory | null>(null);
  const [chosen, setChosen] = useState<CatalogEntry | null>(null);
  const setQuery = useDebounce(setQ, 300);

  const search = useInfiniteQuery({
    queryKey: queryKeys.adminStudio.catalog({ q, category }),
    queryFn: ({ pageParam }) => searchStudioCatalog({ data: { q, category: category ?? undefined, cursor: pageParam ?? undefined } }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: !chosen,
  });
  const entries = search.data?.pages.flatMap((page) => page.entries) ?? [];

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Add model</DialogTitle>
          <DialogDescription>Search fal's catalog. Models that answer with text are not offered.</DialogDescription>
        </DialogHeader>

        {chosen ? (
          <AddModelForm
            entry={chosen}
            onBack={() => setChosen(null)}
          />
        ) : (
          <div className="stack space-4">
            <div className={styles.filters}>
              <div className={styles.search}>
                <Search className={styles.searchIcon} />
                <Input
                  aria-label="Search the fal catalog"
                  placeholder="Search models"
                  value={text}
                  className={styles.searchInput}
                  onChange={(event) => {
                    setText(event.target.value);
                    setQuery(event.target.value);
                  }}
                />
              </div>
              <Select
                items={[{ value: null, label: 'All categories' }, ...CATALOG_CATEGORIES.map((value) => ({ value, label: value }))]}
                value={category}
                onValueChange={(value) => setCategory(value as CatalogCategory | null)}
              >
                <SelectTrigger aria-label="fal category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>All categories</SelectItem>
                  {CATALOG_CATEGORIES.map((value) => (
                    <SelectItem
                      key={value}
                      value={value}
                    >
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {search.isError && (
              <Alert variant="destructive">
                <AlertDescription>{search.error.message}</AlertDescription>
              </Alert>
            )}
            {search.isPending && <Spinner />}
            {search.isSuccess && entries.length === 0 && <p className={styles.muted}>No models found.</p>}

            <ul className={styles.results}>
              {entries.map((entry) => (
                <li
                  key={entry.endpointId}
                  className={styles.result}
                >
                  {entry.thumbnailUrl ? (
                    <img
                      src={entry.thumbnailUrl}
                      alt=""
                      className={styles.thumbnail}
                    />
                  ) : (
                    <span className={styles.thumbnail} />
                  )}
                  <div className={styles.resultText}>
                    <span className="weight-medium">{entry.displayName}</span>
                    <span className={styles.meta}>
                      <span className="type-mono">{entry.endpointId}</span> · {entry.category}
                      {entry.price && ` · ${formatPrice(entry.price)}`}
                    </span>
                    <span className={styles.description}>{entry.description}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Choose ${entry.displayName}`}
                    onClick={() => setChosen(entry)}
                  >
                    Choose
                  </Button>
                </li>
              ))}
            </ul>

            {search.hasNextPage && (
              <Button
                variant="outline"
                disabled={search.isFetchingNextPage}
                onClick={() => search.fetchNextPage()}
              >
                Load more
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddModelForm({ entry, onBack }: { entry: CatalogEntry; onBack: () => void }) {
  const navigate = useNavigate();
  const { data: categories } = useSuspenseQuery(studioCategoriesQueryOptions);
  const [categoryId, setCategoryId] = useState<string | null>(categories[0]?.id ?? null);
  const [name, setName] = useState(entry.displayName);
  const add = useAppMutation(addStudioModel, {
    invalidates: [queryKeys.adminStudio.models, queryKeys.adminStudio.categories],
    successMessage: 'Model added',
    onSuccess: (model) => navigate({ to: '/admin/studio/models/$id', params: { id: model.id } }),
  });

  if (categories.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          Every Model belongs to a Category. <Link to="/admin/studio/categories">Create a Category</Link> first.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form
      className="stack space-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (categoryId) add.mutate({ endpointId: entry.endpointId, categoryId, name });
      }}
    >
      <p className={styles.meta}>
        <span className="type-mono">{entry.endpointId}</span> · {entry.category}
        {entry.price && ` · ${formatPrice(entry.price)}`}
      </p>
      <div className="stack space-2">
        <Label htmlFor="studio-model-category">Category</Label>
        <Select
          items={categories.map((category) => ({ value: category.id, label: category.name }))}
          value={categoryId}
          onValueChange={(value) => setCategoryId(value)}
        >
          <SelectTrigger id="studio-model-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map((category) => (
              <SelectItem
                key={category.id}
                value={category.id}
              >
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="stack space-2">
        <Label htmlFor="studio-model-name">Name</Label>
        <Input
          id="studio-model-name"
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
        >
          Back
        </Button>
        <Button
          type="submit"
          disabled={!categoryId || !name.trim() || add.isPending}
        >
          Add model
        </Button>
      </DialogFooter>
    </form>
  );
}
