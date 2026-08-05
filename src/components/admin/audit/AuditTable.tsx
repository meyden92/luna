import { getRouteApi } from '@tanstack/react-router';
import { useEffect, useState, useTransition } from 'react';
import { Label } from '@/components/ui/label';
import { Table, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDebouncedCallback } from '@/hooks/use-debounced-callback';
import ActionFilter from './ActionFilter';
import AuditTableRows from './AuditTableRows';
import ModelFilter from './ModelFilter';
import Pagination from './Pagination';
import SearchFilter from './SearchFilter';

interface AuditLog {
  id: string;
  model: string;
  action: string;
  recordId: string;
  userId: string | null;
  timestamp: Date;
  before: any;
  after: any;
  user: {
    id: string;
    name: string;
    email: string;
  } | null;
}

interface AuditTableProps {
  searchParams: { model?: string; recordId?: string; search?: string; action?: string };
  models: string[];
  auditData: {
    logs: AuditLog[];
    hasMore: boolean;
    hasPrevious: boolean;
    nextCursor: string | null;
    previousCursor: string | null;
  };
}

interface FilterState {
  search?: string;
  model?: string;
  recordId?: string;
  action?: string;
}

const routeApi = getRouteApi('/_admin/admin/audit/');

export default function AuditTable({ searchParams: initialSearchParams, models, auditData }: AuditTableProps) {
  const navigate = routeApi.useNavigate();
  const { logs, hasMore, hasPrevious, nextCursor, previousCursor } = auditData;
  const [isPending, startTransition] = useTransition();

  const [filters, setFilters] = useState<FilterState>({
    search: initialSearchParams.search,
    model: initialSearchParams.model,
    recordId: initialSearchParams.recordId,
    action: initialSearchParams.action,
  });

  useEffect(() => {
    setFilters({
      search: initialSearchParams.search,
      model: initialSearchParams.model,
      recordId: initialSearchParams.recordId,
      action: initialSearchParams.action,
    });
  }, [initialSearchParams.search, initialSearchParams.model, initialSearchParams.recordId, initialSearchParams.action]);

  const handleFilterChange = (newFilters: Partial<FilterState>) => {
    const updatedFilters = { ...filters, ...newFilters };

    setFilters(updatedFilters);

    const modelChanged = newFilters.model !== undefined && newFilters.model !== filters.model;

    startTransition(() => {
      navigate({
        // Reset paging on filter change; clear recordId when the model switches.
        search: ({ recordId }) => ({
          search: updatedFilters.search || undefined,
          model: updatedFilters.model || undefined,
          action: updatedFilters.action || undefined,
          recordId: modelChanged ? undefined : recordId,
          cursor: undefined,
          direction: undefined,
        }),
      });
    });
  };

  const debouncedSearchChange = useDebouncedCallback((value: string) => {
    handleFilterChange({ search: value.trim() || undefined });
  }, 300);

  const handleSearchSubmitOrClear = (value: string | undefined) => {
    handleFilterChange({ search: value });
  };

  return (
    <div className="p-4 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 items-end">
        <div>
          <Label
            htmlFor="search-filter"
            className="mb-2 block"
          >
            Search
          </Label>
          <SearchFilter
            currentSearch={filters.search}
            onDebouncedChangeAction={debouncedSearchChange}
            onImmediateChangeAction={handleSearchSubmitOrClear}
          />
        </div>

        <div>
          <Label
            htmlFor="model-filter"
            className="mb-2 block"
          >
            Model
          </Label>
          <ModelFilter
            currentModel={filters.model}
            models={models}
            onModelChangeAction={handleFilterChange}
          />
        </div>

        <div>
          <Label
            htmlFor="action-filter"
            className="mb-2 block"
          >
            Action Type
          </Label>
          <ActionFilter
            currentAction={filters.action}
            onActionChangeAction={handleFilterChange}
          />
        </div>
      </div>

      <div className="text-sm text-muted-foreground mb-2">
        {`Showing ${logs.length} logs`}
        {filters.model && ` for model "${filters.model}"`}
        {filters.recordId && ` for record "${filters.recordId}"`}
        {filters.action && ` with action "${filters.action}"`}
        {filters.search && ` matching "${filters.search}"`}
        {isPending && <span className="ml-2 italic text-muted-foreground">Updating...</span>}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">ID</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Record ID</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Time</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <AuditTableRows logs={logs} />
        </Table>
      </div>

      {(hasPrevious || hasMore) && (
        <Pagination
          filters={filters}
          hasPrevious={hasPrevious}
          hasNext={hasMore}
          previousCursor={previousCursor}
          nextCursor={nextCursor}
        />
      )}
    </div>
  );
}
