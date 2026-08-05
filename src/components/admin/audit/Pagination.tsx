import { Link } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/libs/utils';

interface FilterState {
  search?: string;
  model?: string;
  recordId?: string;
  action?: string;
}

interface PaginationProps {
  filters: FilterState;
  hasPrevious: boolean;
  hasNext: boolean;
  previousCursor: string | null;
  nextCursor: string | null;
}

function buildSearch(params: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      result[key] = value;
    }
  }
  return result;
}

export default function Pagination({ filters, hasPrevious, hasNext, previousCursor, nextCursor }: PaginationProps) {
  return (
    <div className="mt-6 flex justify-center">
      <nav className="flex items-center gap-1">
        {hasPrevious && previousCursor ? (
          <Link
            to="/admin/audit"
            search={buildSearch({ ...filters, cursor: previousCursor, direction: 'previous' })}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1 px-2.5')}
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:block">Previous</span>
          </Link>
        ) : (
          <span className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1 px-2.5 opacity-50 cursor-not-allowed')}>
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:block">Previous</span>
          </span>
        )}

        {hasNext && nextCursor ? (
          <Link
            to="/admin/audit"
            search={buildSearch({ ...filters, cursor: nextCursor, direction: 'next' })}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1 px-2.5')}
          >
            <span className="hidden sm:block">Next</span>
            <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <span className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1 px-2.5 opacity-50 cursor-not-allowed')}>
            <span className="hidden sm:block">Next</span>
            <ChevronRight className="h-4 w-4" />
          </span>
        )}
      </nav>
    </div>
  );
}
