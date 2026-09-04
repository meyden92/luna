import { Link } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/libs/utils';
import styles from './Pagination.module.css';

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
  const stepClass = cn(buttonVariants({ variant: 'outline', size: 'sm' }), styles.step);

  return (
    <div className={cn(styles.root, 'margin-top-6')}>
      <nav className={styles.nav}>
        {hasPrevious && previousCursor ? (
          <Link
            to="/admin/audit"
            search={buildSearch({ ...filters, cursor: previousCursor, direction: 'previous' })}
            className={stepClass}
          >
            <ChevronLeft />
            <span className="hide-below-sm">Previous</span>
          </Link>
        ) : (
          <span
            className={stepClass}
            data-disabled="true"
          >
            <ChevronLeft />
            <span className="hide-below-sm">Previous</span>
          </span>
        )}

        {hasNext && nextCursor ? (
          <Link
            to="/admin/audit"
            search={buildSearch({ ...filters, cursor: nextCursor, direction: 'next' })}
            className={stepClass}
          >
            <span className="hide-below-sm">Next</span>
            <ChevronRight />
          </Link>
        ) : (
          <span
            className={stepClass}
            data-disabled="true"
          >
            <span className="hide-below-sm">Next</span>
            <ChevronRight />
          </span>
        )}
      </nav>
    </div>
  );
}
