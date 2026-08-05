import { useLocation, useNavigate, useSearch } from '@tanstack/react-router';
import { addMonths, endOfMonth, endOfWeek, format, isToday, isWeekend, startOfMonth, startOfWeek, subMonths, subWeeks } from 'date-fns';
import { de, enUS } from 'date-fns/locale';
import { CalendarDaysIcon, CalendarIcon, CalendarRangeIcon, ChevronLeftIcon, ChevronRightIcon, HomeIcon } from 'lucide-react';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/libs/utils';

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

interface DateRangePickerProps {
  enableRangeSelection?: boolean;
  enablePreviousMonthButton?: boolean;
  enableNextMonthButton?: boolean;
  maxPreviousMonths?: number;
  allowFutureMonths?: boolean;
  showCurrentMonthButton?: boolean;
  locale?: string;
  highlightCurrentDay?: boolean;
  excludeWeekend?: boolean;
  enableCurrentWeek?: boolean;
  enablePastWeek?: boolean;
}

export function DateRangePicker({
  enableRangeSelection = true,
  enablePreviousMonthButton = true,
  enableNextMonthButton = true,
  maxPreviousMonths,
  allowFutureMonths = false,
  showCurrentMonthButton = false,
  locale = 'de',
  highlightCurrentDay = false,
  excludeWeekend = true,
  enableCurrentWeek = true,
  enablePastWeek = false,
}: DateRangePickerProps = {}) {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (loc) => loc.pathname });
  const searchObj = useSearch({ strict: false }) as Record<string, string | string[] | undefined>;
  const searchParams = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchObj ?? {})) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const v of value) params.append(key, String(v));
      } else {
        params.set(key, String(value));
      }
    }
    return params;
  }, [searchObj]);

  const [date, setDate] = useState<DateRange>({ from: undefined, to: undefined });
  const [isOpen, setIsOpen] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(new Date());
  const [hoveredDate, setHoveredDate] = useState<Date | null>(null);
  const [isPending, startTransition] = useTransition();
  const [optimisticDateRange, setOptimisticDateRange] = useState<DateRange | null>(null);

  // Get locale object
  const localeObj = locale === 'de' ? de : enUS;

  // Calculate if navigation buttons should be disabled
  const currentSubmonth = Number.parseInt(searchParams.get('submonth') || '0', 10);
  const isPreviousDisabled = !enablePreviousMonthButton || (maxPreviousMonths !== undefined && currentSubmonth >= maxPreviousMonths);
  const isNextDisabled = !enableNextMonthButton || (!allowFutureMonths && currentSubmonth <= 0);

  // Initialize from URL params
  useEffect(() => {
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const submonth = searchParams.get('submonth');

    if (from && to) {
      const fromDate = new Date(from);
      const newRange = {
        from: fromDate,
        to: new Date(to),
      };
      setDate(newRange);
      // Update display month to match the selected range
      setDisplayMonth(fromDate);
      // Clear optimistic state when URL params change
      setOptimisticDateRange(null);
    } else if (submonth) {
      const monthsAgo = Number.parseInt(submonth, 10);
      const targetDate = subMonths(new Date(), monthsAgo);
      const newRange = {
        from: startOfMonth(targetDate),
        to: endOfMonth(targetDate),
      };
      setDate(newRange);
      // Update display month to match the selected month
      setDisplayMonth(targetDate);
      // Clear optimistic state when URL params change
      setOptimisticDateRange(null);
    }
  }, [searchParams]);

  const updateURL = (newDate: DateRange | 'prev' | 'next') => {
    const params = new URLSearchParams(searchParams.toString());
    let optimisticRange: DateRange | null = null;

    if (newDate === 'prev') {
      // Previous month
      const currentSubmonth = Number.parseInt(searchParams.get('submonth') || '0', 10);
      const targetDate = subMonths(new Date(), currentSubmonth + 1);
      optimisticRange = {
        from: startOfMonth(targetDate),
        to: endOfMonth(targetDate),
      };
      // Update display month to match the selected month
      setDisplayMonth(targetDate);
      params.delete('from');
      params.delete('to');
      params.set('submonth', String(currentSubmonth + 1));
    } else if (newDate === 'next') {
      // Next month
      const currentSubmonth = Number.parseInt(searchParams.get('submonth') || '0', 10);
      if (currentSubmonth > 0) {
        const targetDate = subMonths(new Date(), currentSubmonth - 1);
        optimisticRange = {
          from: startOfMonth(targetDate),
          to: endOfMonth(targetDate),
        };
        // Update display month to match the selected month
        setDisplayMonth(targetDate);
        params.delete('from');
        params.delete('to');
        params.set('submonth', String(currentSubmonth - 1));
      }
    } else if (newDate.from && newDate.to) {
      // Custom date range
      optimisticRange = newDate;
      // Update display month to show the selected date range
      setDisplayMonth(newDate.from);
      params.delete('submonth');
      params.set('from', format(newDate.from, 'yyyy-MM-dd'));
      params.set('to', format(newDate.to, 'yyyy-MM-dd'));
    }

    // Set optimistic state immediately
    if (optimisticRange) {
      setOptimisticDateRange(optimisticRange);
    }

    // Navigate with transition
    startTransition(() => {
      navigate({ to: pathname, search: Object.fromEntries(params) });
    });
  };

  const handleMonthNavigation = (direction: 'prev' | 'next' | 'current') => {
    if (direction === 'current') {
      const currentDate = new Date();
      const optimisticRange = {
        from: startOfMonth(currentDate),
        to: endOfMonth(currentDate),
      };
      setOptimisticDateRange(optimisticRange);
      // Update display month to current month
      setDisplayMonth(currentDate);

      const params = new URLSearchParams(searchParams.toString());
      params.delete('from');
      params.delete('to');
      params.delete('submonth');

      startTransition(() => {
        navigate({ to: pathname, search: Object.fromEntries(params) });
      });
    } else {
      updateURL(direction);
    }
  };

  const selectCurrentWeek = () => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    // Exclude weekend if needed (Monday to Friday)
    const fromDate = weekStart;
    const toDate = new Date(weekEnd);
    toDate.setDate(toDate.getDate() - 2); // Friday

    const newRange = { from: fromDate, to: toDate };
    setDate(newRange);
    updateURL(newRange);
  };

  const selectPastWeek = () => {
    const lastWeek = subWeeks(new Date(), 1);
    const weekStart = startOfWeek(lastWeek, { weekStartsOn: 1 }); // Monday
    const weekEnd = endOfWeek(lastWeek, { weekStartsOn: 1 });
    // Exclude weekend if needed (Monday to Friday)
    const fromDate = weekStart;
    const toDate = new Date(weekEnd);
    toDate.setDate(toDate.getDate() - 2); // Friday

    const newRange = { from: fromDate, to: toDate };
    setDate(newRange);
    updateURL(newRange);
  };

  const handleDateClick = (clickedDate: Date) => {
    if (!enableRangeSelection) {
      // For month-only selection, select the entire month
      const monthStart = startOfMonth(clickedDate);
      const monthEnd = endOfMonth(clickedDate);
      const newRange = { from: monthStart, to: monthEnd };
      setDate(newRange);
      updateURL(newRange);
      setIsOpen(false);
    } else {
      // Range selection logic
      if (!date.from || (date.from && date.to)) {
        // Start new selection
        setDate({ from: clickedDate, to: undefined });
      } else {
        // Complete selection
        if (clickedDate < date.from) {
          const newRange = { from: clickedDate, to: date.from };
          setDate(newRange);
          updateURL(newRange);
          setIsOpen(false);
        } else {
          const newRange = { from: date.from, to: clickedDate };
          setDate(newRange);
          updateURL(newRange);
          setIsOpen(false);
        }
      }
    }
  };

  const renderCalendar = (month: Date) => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const startDate = new Date(monthStart);
    // Start week on Monday (1) instead of Sunday (0)
    const dayOfWeek = startDate.getDay();
    const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    startDate.setDate(startDate.getDate() - daysToSubtract);

    const days = [];
    const currentDate = new Date(startDate);

    while (currentDate <= monthEnd || currentDate.getDay() !== 1) {
      days.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
      if (currentDate.getDay() === 1 && currentDate > monthEnd) break;
    }

    return (
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={() => setDisplayMonth(subMonths(displayMonth, 1))}
            className="p-1 hover:bg-accent rounded"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <div className="text-sm font-medium">{format(month, 'MMMM yyyy', { locale: localeObj })}</div>
          <button
            type="button"
            onClick={() => setDisplayMonth(addMonths(displayMonth, 1))}
            className="p-1 hover:bg-accent rounded"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {(locale === 'de' ? ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']).map((day) => (
            <div
              key={day}
              className="text-xs text-muted-foreground text-center p-1"
            >
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, idx) => {
            const isInMonth = day.getMonth() === month.getMonth();
            // Normalize dates to compare only year, month, and day (not time)
            const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
            const fromStart = date.from ? new Date(date.from.getFullYear(), date.from.getMonth(), date.from.getDate()) : null;
            const toStart = date.to ? new Date(date.to.getFullYear(), date.to.getMonth(), date.to.getDate()) : null;

            const isSelected =
              (fromStart && dayStart.getTime() === fromStart.getTime()) || (toStart && dayStart.getTime() === toStart.getTime());
            const isInRange = fromStart && toStart && dayStart >= fromStart && dayStart <= toStart;
            const isHoveredRange =
              date.from &&
              !date.to &&
              hoveredDate &&
              ((day >= date.from && day <= hoveredDate) || (day <= date.from && day >= hoveredDate));
            const isTodayDate = highlightCurrentDay && isToday(day);
            const isWeekendDay = excludeWeekend && isWeekend(day);

            return (
              <button
                type="button"
                // biome-ignore lint/suspicious/noArrayIndexKey: <The order of days will never change>
                key={idx}
                onClick={() => handleDateClick(day)}
                onMouseEnter={() => setHoveredDate(day)}
                onMouseLeave={() => setHoveredDate(null)}
                disabled={!isInMonth}
                className={cn(
                  'p-2 text-sm rounded-md transition-colors',
                  !isInMonth && 'text-muted-foreground/50',
                  isInMonth && !isWeekendDay && 'hover:bg-accent',
                  isSelected && 'bg-primary text-primary-foreground hover:bg-primary/90',
                  isInRange && !isSelected && 'bg-primary/20',
                  isHoveredRange && 'bg-primary/10',
                  isTodayDate && 'ring-2 ring-primary/50 bg-primary/10 font-semibold',
                  isWeekendDay && isInMonth && 'text-muted-foreground/60 hover:bg-accent/50',
                )}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const getDisplayText = () => {
    // Use optimistic state if available
    const displayRange = optimisticDateRange || date;

    const submonth = searchParams.get('submonth');

    // If we have optimistic range, show it immediately
    if (optimisticDateRange?.from && optimisticDateRange?.to) {
      const isFullMonth =
        optimisticDateRange.from.getDate() === 1 &&
        optimisticDateRange.to.getDate() === endOfMonth(optimisticDateRange.to).getDate() &&
        optimisticDateRange.from.getMonth() === optimisticDateRange.to.getMonth();

      if (isFullMonth || !enableRangeSelection) {
        return format(optimisticDateRange.from, 'MMMM yyyy', { locale: localeObj });
      }
      return `${format(optimisticDateRange.from, 'dd.MM.yyyy')} - ${format(optimisticDateRange.to, 'dd.MM.yyyy')}`;
    }

    if (submonth) {
      const monthsAgo = Number.parseInt(submonth, 10);
      if (monthsAgo === 0) return format(new Date(), 'MMMM yyyy', { locale: localeObj });
      const targetDate = subMonths(new Date(), monthsAgo);
      return format(targetDate, 'MMMM yyyy', { locale: localeObj });
    }

    if (displayRange.from && displayRange.to) {
      // Check if it's a full month
      const isFullMonth =
        displayRange.from.getDate() === 1 &&
        displayRange.to.getDate() === endOfMonth(displayRange.to).getDate() &&
        displayRange.from.getMonth() === displayRange.to.getMonth();

      if (isFullMonth || !enableRangeSelection) {
        return format(displayRange.from, 'MMMM yyyy', { locale: localeObj });
      }
      return `${format(displayRange.from, 'dd.MM.yyyy')} - ${format(displayRange.to, 'dd.MM.yyyy')}`;
    }

    return format(new Date(), 'MMMM yyyy', { locale: localeObj });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {enablePreviousMonthButton && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleMonthNavigation('prev')}
            aria-label="Previous month"
            disabled={isPreviousDisabled || isPending}
            className={cn('transition-all', isPending && 'opacity-70 cursor-wait')}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
        )}

        <Popover
          open={enableRangeSelection ? isOpen : false}
          onOpenChange={enableRangeSelection ? setIsOpen : undefined}
        >
          <PopoverTrigger>
            <Button
              variant="outline"
              className={cn(
                'justify-start text-left font-normal min-w-[240px] transition-all',
                !date.from && !searchParams.get('submonth') && !optimisticDateRange && 'text-muted-foreground',
                isPending && 'opacity-70 cursor-wait',
              )}
              disabled={isPending}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {getDisplayText()}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto p-0"
            align="start"
          >
            <div className="flex">
              {renderCalendar(displayMonth)}
              {renderCalendar(addMonths(displayMonth, 1))}
            </div>
          </PopoverContent>
        </Popover>

        {enableNextMonthButton && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleMonthNavigation('next')}
            aria-label="Next month"
            disabled={isNextDisabled || isPending}
            className={cn('transition-all', isPending && 'opacity-70 cursor-wait')}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
        )}

        {showCurrentMonthButton && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleMonthNavigation('current')}
            aria-label="Current month"
            disabled={isPending}
            className={cn('transition-all', isPending && 'opacity-70 cursor-wait')}
          >
            <HomeIcon className="h-4 w-4" />
          </Button>
        )}
      </div>

      {(enableCurrentWeek || enablePastWeek) && (
        <div className="flex gap-1">
          {enablePastWeek && (
            <Button
              variant="ghost"
              size="sm"
              onClick={selectPastWeek}
              className={cn('text-xs h-7 px-2 transition-all', isPending && 'opacity-70 cursor-wait')}
              aria-label="Select past week"
              disabled={isPending}
            >
              <CalendarRangeIcon className="h-3 w-3 mr-1" />
              Letzte Woche
            </Button>
          )}
          {enableCurrentWeek && (
            <Button
              variant="ghost"
              size="sm"
              onClick={selectCurrentWeek}
              className={cn('text-xs h-7 px-2 transition-all', isPending && 'opacity-70 cursor-wait')}
              aria-label="Select current week"
              disabled={isPending}
            >
              <CalendarDaysIcon className="h-3 w-3 mr-1" />
              Diese Woche
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
