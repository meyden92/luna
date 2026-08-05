import { endOfMonth, startOfMonth, subMonths } from 'date-fns';

export interface DateRangeParams {
  from?: string;
  to?: string;
  submonth?: string;
}

export interface DateRange {
  from: Date;
  to: Date;
}

/**
 * Parse date range parameters from URL search params
 * @param params - The search params object containing from, to, or submonth
 * @returns A DateRange object with from and to dates
 */
function parseDateRange(params: DateRangeParams): DateRange {
  // If custom date range is provided
  if (params.from && params.to) {
    return {
      from: new Date(params.from),
      to: new Date(params.to),
    };
  }

  // If submonth parameter is provided
  if (params.submonth) {
    const monthsAgo = Number.parseInt(params.submonth, 10);
    const targetDate = monthsAgo === 0 ? new Date() : subMonths(new Date(), monthsAgo);
    return {
      from: startOfMonth(targetDate),
      to: endOfMonth(targetDate),
    };
  }

  // Default to current month
  const now = new Date();
  return {
    from: startOfMonth(now),
    to: endOfMonth(now),
  };
}

/**
 * Get date range from URL search params (async version for server components)
 * @param searchParams - The promise of search params from Next.js page props
 * @returns A promise of DateRange object
 */
export async function getDateRange(searchParams: Promise<DateRangeParams>): Promise<DateRange> {
  const params = await searchParams;
  return parseDateRange(params);
}

/**
 * Format a date range for display
 * @param range - The date range to format
 * @returns A formatted string representation
 */
export function formatDateRange(range: DateRange): string {
  const fromMonth = range.from.getMonth();
  const toMonth = range.to.getMonth();
  const fromYear = range.from.getFullYear();
  const toYear = range.to.getFullYear();

  // Same month and year - show as single month
  if (fromMonth === toMonth && fromYear === toYear) {
    return range.from.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  // Different months/years - show full range
  return `${range.from.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${range.to.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}
