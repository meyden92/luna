import type { Locale } from 'date-fns';
import {
  addMonths,
  differenceInDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/libs/utils';

import styles from './calendar-view.module.css';

// ============================================================================
// Types
// ============================================================================

export type EventColor = 'default' | 'primary' | 'secondary' | 'destructive' | 'success' | 'warning';

const KNOWN_EVENT_COLORS: EventColor[] = ['default', 'primary', 'secondary', 'destructive', 'success', 'warning'];

function isCustomEventColor(color: string): boolean {
  return !KNOWN_EVENT_COLORS.includes(color as EventColor);
}

export type MonthlyCalendarSize = 'default' | 'sm' | 'lg';
export type MonthlyCalendarVariant = 'default' | 'card' | 'bordered';
export type MonthlyNavLayout = 'default' | 'spread' | 'centered';
export type MonthlyEventVariant = 'compact' | 'default' | 'expanded';

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date | string;
  end?: Date | string;
  color?: EventColor | (string & {});
  metadata?: Record<string, unknown>;
}

export interface DayHighlight {
  date: Date;
  color?: string;
  label?: string;
}

interface EventPlacement {
  event: CalendarEvent;
  lane: number;
  startCol: number;
  span: number;
  continuesFromPrev: boolean;
  continuesToNext: boolean;
}

interface WeekData {
  key: string;
  days: Date[];
  placements: EventPlacement[];
}

// ============================================================================
// Context
// ============================================================================

interface MonthlyCalendarContextValue {
  currentMonth: Date;
  weekStartsOn: 0 | 1;
  events: CalendarEvent[];
  highlights: DayHighlight[];
  locale?: Locale;
  weeks: WeekData[];
  highlightsByDate: Map<string, DayHighlight[]>;
  maxEventRows: number;
  fillHeight: boolean;
  dimOutsideMonthDays: boolean;
  showOutsideMonthDays: boolean;
  onDayClick?: (date: Date, events: CalendarEvent[]) => void;
  onEventClick?: (event: CalendarEvent) => void;
  setCurrentMonth: (date: Date) => void;
  goToPrevMonth: () => void;
  goToNextMonth: () => void;
  goToToday: () => void;
  getEventsForDate: (date: Date) => CalendarEvent[];
}

const MonthlyCalendarContext = React.createContext<MonthlyCalendarContextValue | null>(null);

export function useMonthlyCalendar() {
  const context = React.useContext(MonthlyCalendarContext);
  if (!context) {
    throw new Error('useMonthlyCalendar must be used within MonthlyCalendar');
  }
  return context;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Parse date string as local date, not UTC.
 * new Date("2026-01-22") parses as UTC midnight which shifts day in local timezone.
 */
function toDate(date: Date | string): Date {
  if (typeof date === 'string') {
    const [year, month, day] = date.split('-').map(Number);
    if (year && month && day) {
      return new Date(year, month - 1, day);
    }
    return new Date(date);
  }
  return date;
}

function formatDateKey(date: Date | string): string {
  return format(toDate(date), 'yyyy-MM-dd');
}

function calculateEventPlacements(events: CalendarEvent[], weekStart: Date, weekEnd: Date, _weekStartsOn: 0 | 1): EventPlacement[] {
  const weekStartDay = startOfDay(weekStart);
  const weekEndDay = startOfDay(weekEnd);

  // Filter events that overlap with this week
  const relevantEvents = events.filter((event) => {
    const eventStart = startOfDay(toDate(event.start));
    const eventEnd = event.end ? startOfDay(toDate(event.end)) : eventStart;
    return eventStart <= weekEndDay && eventEnd >= weekStartDay;
  });

  // Sort: longer events first (they get priority for lanes), then by start date
  const sorted = [...relevantEvents].sort((a, b) => {
    const aDuration = a.end ? differenceInDays(toDate(a.end), toDate(a.start)) : 0;
    const bDuration = b.end ? differenceInDays(toDate(b.end), toDate(b.start)) : 0;
    if (bDuration !== aDuration) return bDuration - aDuration;
    return toDate(a.start).getTime() - toDate(b.start).getTime();
  });

  const placements: EventPlacement[] = [];
  const laneOccupancy: Map<number, Date>[] = []; // lane -> array of end dates

  for (const event of sorted) {
    const eventStart = startOfDay(toDate(event.start));
    const eventEnd = event.end ? startOfDay(toDate(event.end)) : eventStart;

    // Calculate column positions within this week
    const visibleStart = eventStart < weekStartDay ? weekStartDay : eventStart;
    const visibleEnd = eventEnd > weekEndDay ? weekEndDay : eventEnd;

    const startCol = differenceInDays(visibleStart, weekStartDay);
    const span = differenceInDays(visibleEnd, visibleStart) + 1;

    // Find available lane
    let lane = 0;
    while (true) {
      if (!laneOccupancy[lane]) {
        laneOccupancy[lane] = new Map();
      }

      const currentLane = laneOccupancy[lane]!;

      // Check if lane is free for all days this event occupies
      // Use >= to ensure events sharing the same day go to different lanes
      let laneFree = true;
      for (let col = startCol; col < startCol + span; col++) {
        const occupiedUntil = currentLane.get(col);
        if (occupiedUntil && occupiedUntil >= visibleStart) {
          laneFree = false;
          break;
        }
      }

      if (laneFree) break;
      lane++;
    }

    // Occupy the lane
    const targetLane = laneOccupancy[lane]!;
    for (let col = startCol; col < startCol + span; col++) {
      targetLane.set(col, visibleEnd);
    }

    placements.push({
      event,
      lane,
      startCol,
      span,
      continuesFromPrev: eventStart < weekStartDay,
      continuesToNext: eventEnd > weekEndDay,
    });
  }

  return placements;
}

function generateWeeksData(currentMonth: Date, events: CalendarEvent[], weekStartsOn: 0 | 1): WeekData[] {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn });

  const allDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const weeks: WeekData[] = [];

  for (let i = 0; i < allDays.length; i += 7) {
    const weekDays = allDays.slice(i, i + 7);
    const weekStart = weekDays[0]!;
    const weekEnd = weekDays[6]!;

    weeks.push({
      key: format(weekStart, 'yyyy-MM-dd'),
      days: weekDays,
      placements: calculateEventPlacements(events, weekStart, weekEnd, weekStartsOn),
    });
  }

  return weeks;
}

/**
 * Calculate how many event placements occupy each column (day) in a week.
 * Used to determine overflow per day.
 */
function getPlacementsPerColumn(placements: EventPlacement[]): number[] {
  const counts: number[] = [0, 0, 0, 0, 0, 0, 0];
  for (const p of placements) {
    for (let col = p.startCol; col < p.startCol + p.span; col++) {
      if (col >= 0 && col < 7) {
        counts[col] = (counts[col] ?? 0) + 1;
      }
    }
  }
  return counts;
}

// ============================================================================
// Components
// ============================================================================

export interface MonthlyCalendarProps extends React.ComponentProps<'div'> {
  currentMonth?: Date;
  defaultMonth?: Date;
  onCurrentMonthChange?: (month: Date) => void;
  weekStartsOn?: 0 | 1;
  events?: CalendarEvent[];
  highlights?: DayHighlight[];
  onDayClick?: (date: Date, events: CalendarEvent[]) => void;
  onEventClick?: (event: CalendarEvent) => void;
  maxEventRows?: number;
  locale?: Locale;
  size?: MonthlyCalendarSize;
  variant?: MonthlyCalendarVariant;
  /** Stretch calendar to fill parent container height (default: true) */
  fillHeight?: boolean;
  /** Show days from previous/next months (default: true) */
  showOutsideMonthDays?: boolean;
  /** Apply dimmed styling to outside month days (default: true) */
  dimOutsideMonthDays?: boolean;
}

function MonthlyCalendar({
  className,
  children,
  currentMonth: controlledMonth,
  defaultMonth,
  onCurrentMonthChange,
  weekStartsOn = 1,
  events = [],
  highlights = [],
  onDayClick,
  onEventClick,
  maxEventRows = 3,
  locale,
  size = 'default',
  variant = 'default',
  fillHeight = true,
  showOutsideMonthDays = true,
  dimOutsideMonthDays = true,
  ...props
}: MonthlyCalendarProps) {
  const [internalMonth, setInternalMonth] = React.useState(() => defaultMonth ?? controlledMonth ?? new Date());

  const currentMonth = controlledMonth ?? internalMonth;

  const setCurrentMonth = React.useCallback(
    (month: Date) => {
      setInternalMonth(month);
      onCurrentMonthChange?.(month);
    },
    [onCurrentMonthChange],
  );

  const goToPrevMonth = React.useCallback(() => {
    setCurrentMonth(subMonths(currentMonth, 1));
  }, [currentMonth, setCurrentMonth]);

  const goToNextMonth = React.useCallback(() => {
    setCurrentMonth(addMonths(currentMonth, 1));
  }, [currentMonth, setCurrentMonth]);

  const goToToday = React.useCallback(() => {
    setCurrentMonth(startOfMonth(new Date()));
  }, [setCurrentMonth]);

  // Pre-compute weeks with event placements
  const weeks = React.useMemo(() => generateWeeksData(currentMonth, events, weekStartsOn), [currentMonth, events, weekStartsOn]);

  // Pre-compute highlights by date
  const highlightsByDate = React.useMemo(() => {
    const map = new Map<string, DayHighlight[]>();
    for (const highlight of highlights) {
      const key = formatDateKey(highlight.date);
      const existing = map.get(key) ?? [];
      map.set(key, [...existing, highlight]);
    }
    return map;
  }, [highlights]);

  // Pre-compute events by date for quick lookup
  const eventsByDate = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const eventStart = startOfDay(toDate(event.start));
      const eventEnd = event.end ? startOfDay(toDate(event.end)) : eventStart;
      const days = eachDayOfInterval({ start: eventStart, end: eventEnd });
      for (const day of days) {
        const key = formatDateKey(day);
        const existing = map.get(key) ?? [];
        map.set(key, [...existing, event]);
      }
    }
    return map;
  }, [events]);

  const getEventsForDate = React.useCallback((date: Date) => eventsByDate.get(formatDateKey(date)) ?? [], [eventsByDate]);

  const contextValue = React.useMemo<MonthlyCalendarContextValue>(
    () => ({
      currentMonth,
      weekStartsOn,
      events,
      highlights,
      locale,
      weeks,
      highlightsByDate,
      maxEventRows,
      fillHeight,
      dimOutsideMonthDays,
      showOutsideMonthDays,
      onDayClick,
      onEventClick,
      setCurrentMonth,
      goToPrevMonth,
      goToNextMonth,
      goToToday,
      getEventsForDate,
    }),
    [
      currentMonth,
      weekStartsOn,
      events,
      highlights,
      locale,
      weeks,
      highlightsByDate,
      maxEventRows,
      fillHeight,
      dimOutsideMonthDays,
      showOutsideMonthDays,
      onDayClick,
      onEventClick,
      setCurrentMonth,
      goToPrevMonth,
      goToNextMonth,
      goToToday,
      getEventsForDate,
    ],
  );

  return (
    <MonthlyCalendarContext.Provider value={contextValue}>
      <div
        data-slot="monthly-calendar"
        data-size={size}
        data-variant={variant}
        data-fill-height={fillHeight || undefined}
        className={cn(styles.root, className)}
        {...props}
      >
        {children}
      </div>
    </MonthlyCalendarContext.Provider>
  );
}

// Navigation
export interface MonthlyNavProps extends React.ComponentProps<'div'> {
  layout?: MonthlyNavLayout;
  showTodayButton?: boolean;
  renderPrevButton?: (props: { onClick: () => void }) => React.ReactNode;
  renderNextButton?: (props: { onClick: () => void }) => React.ReactNode;
  renderTitle?: (props: { month: Date; formatted: string }) => React.ReactNode;
}

function MonthlyNav({
  className,
  showTodayButton = false,
  renderPrevButton,
  renderNextButton,
  renderTitle,
  layout = 'default',
  ...props
}: MonthlyNavProps) {
  const { currentMonth, goToPrevMonth, goToNextMonth, goToToday, locale } = useMonthlyCalendar();

  const formattedMonth = format(currentMonth, 'MMMM yyyy', { locale });

  return (
    <div
      data-slot="monthly-nav"
      data-layout={layout}
      className={cn(styles.nav, className)}
      {...props}
    >
      {renderPrevButton ? (
        renderPrevButton({ onClick: goToPrevMonth })
      ) : (
        <Button
          variant="ghost"
          size="icon"
          onClick={goToPrevMonth}
          aria-label="Previous month"
        >
          <ChevronLeftIcon className={styles.navIcon} />
        </Button>
      )}

      {renderTitle ? (
        renderTitle({ month: currentMonth, formatted: formattedMonth })
      ) : (
        <h2 className={styles.navTitle}>{formattedMonth}</h2>
      )}

      {renderNextButton ? (
        renderNextButton({ onClick: goToNextMonth })
      ) : (
        <Button
          variant="ghost"
          size="icon"
          onClick={goToNextMonth}
          aria-label="Next month"
        >
          <ChevronRightIcon className={styles.navIcon} />
        </Button>
      )}

      {showTodayButton && (
        <Button
          variant="outline"
          size="sm"
          onClick={goToToday}
          className={styles.navToday}
        >
          Today
        </Button>
      )}
    </div>
  );
}

// Weekdays header
export interface MonthlyWeekdaysProps extends React.ComponentProps<'div'> {
  dayFormat?: 'short' | 'narrow' | 'long';
}

function MonthlyWeekdays({ className, dayFormat = 'short', ...props }: MonthlyWeekdaysProps) {
  const { weekStartsOn, locale } = useMonthlyCalendar();

  const weekdays = React.useMemo(() => {
    const baseDate = new Date(2024, 0, 7); // A Sunday
    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const dayIndex = (weekStartsOn + i) % 7;
      const date = new Date(baseDate);
      date.setDate(date.getDate() + dayIndex);
      const formatStr = dayFormat === 'narrow' ? 'EEEEE' : dayFormat === 'long' ? 'EEEE' : 'EEE';
      days.push(format(date, formatStr, { locale }));
    }
    return days;
  }, [weekStartsOn, locale, dayFormat]);

  return (
    <div
      data-slot="monthly-weekdays"
      className={cn(styles.weekdays, className)}
      {...props}
    >
      {weekdays.map((day) => (
        <div
          key={day}
          className={styles.weekday}
        >
          {day}
        </div>
      ))}
    </div>
  );
}

// Layout constants for calculating dynamic maxEventRows
const LAYOUT = {
  weekdaysHeaderHeight: 40, // Height of Mon-Sun header
  dayNumberHeight: 34, // Height reserved for day number (2rem + 2px)
  eventRowHeight: 22, // Height of each event row (h-5 + mb-0.5 = 20px + 2px)
  overflowRowHeight: 24, // Height reserved for "+X more" row
  minEventRows: 2, // Minimum event rows to show
  maxEventRowsCap: 10, // Maximum event rows cap
} as const;

/**
 * Calculate minimum calendar height for a given number of weeks
 * Ensures at least minEventRows can be displayed per week
 */
function calculateMinCalendarHeight(numWeeks: number): number {
  const heightPerWeek = LAYOUT.dayNumberHeight + LAYOUT.minEventRows * LAYOUT.eventRowHeight + LAYOUT.overflowRowHeight;
  return LAYOUT.weekdaysHeaderHeight + numWeeks * heightPerWeek;
}

// Standard minimum height for 6 weeks (most common calendar layout)
const MIN_CALENDAR_HEIGHT = calculateMinCalendarHeight(6); // ~652px

/**
 * Calculate the optimal number of event rows based on available height
 */
function calculateMaxEventRows(containerHeight: number, numWeeks: number): number {
  // Available height for all week rows
  const availableForWeeks = containerHeight - LAYOUT.weekdaysHeaderHeight;
  // Height available per week
  const heightPerWeek = availableForWeeks / numWeeks;
  // Height available for events (excluding day number area)
  const eventAreaHeight = heightPerWeek - LAYOUT.dayNumberHeight;
  // Calculate max rows (always reserve space for overflow indicator)
  const maxRows = Math.floor((eventAreaHeight - LAYOUT.overflowRowHeight) / LAYOUT.eventRowHeight);
  // Clamp to reasonable bounds
  return Math.max(LAYOUT.minEventRows, Math.min(maxRows, LAYOUT.maxEventRowsCap));
}

// Main content container
export interface MonthlyContentProps extends React.ComponentProps<'div'> {}

function MonthlyContent({ className, ...props }: MonthlyContentProps) {
  const {
    weeks,
    currentMonth,
    maxEventRows: configuredMaxEventRows,
    fillHeight,
    dimOutsideMonthDays,
    showOutsideMonthDays,
    highlightsByDate,
    onDayClick,
    onEventClick,
    getEventsForDate,
  } = useMonthlyCalendar();

  const contentRef = React.useRef<HTMLDivElement>(null);
  const [measuredHeight, setMeasuredHeight] = React.useState<number>(0);

  // Measure container height and recalculate on resize
  React.useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element) return;

    const updateHeight = () => {
      const height = element.clientHeight;
      setMeasuredHeight(height);

      // Development warning for undersized containers
      if (process.env.NODE_ENV === 'development' && height > 0 && height < MIN_CALENDAR_HEIGHT) {
        const calculatedRows = calculateMaxEventRows(height, 6);
        console.warn(
          `[MonthlyCalendar] Container height (${height}px) is below recommended minimum (${MIN_CALENDAR_HEIGHT}px). ` +
            `Calendar will display ${calculatedRows} event rows per week. ` +
            `For optimal display with 3+ event rows, ensure the parent container has at least ${Math.ceil(calculateMinCalendarHeight(6) * 1.3)}px height.`,
        );
      }
    };

    // Initial measurement
    updateHeight();

    // Watch for resize
    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, []);

  // Calculate dynamic maxEventRows based on measured height
  const maxEventRows = React.useMemo(() => {
    if (!fillHeight || measuredHeight === 0) {
      // Use configured value when not filling height or before measurement
      return configuredMaxEventRows;
    }
    // Calculate based on available space
    return calculateMaxEventRows(measuredHeight, weeks.length);
  }, [fillHeight, measuredHeight, weeks.length, configuredMaxEventRows]);

  // Calculate minimum height for this specific calendar (based on actual week count)
  const minHeight = React.useMemo(() => calculateMinCalendarHeight(weeks.length), [weeks.length]);

  return (
    <div
      ref={contentRef}
      data-slot="monthly-content"
      data-fill-height={fillHeight || undefined}
      className={cn(styles.content, className)}
      style={{ minHeight }}
      {...props}
    >
      <div
        data-fill-height={fillHeight || undefined}
        className={styles.contentInner}
      >
        <div
          data-fill-height={fillHeight || undefined}
          className={styles.contentAspect}
        >
          <MonthlyWeekdays />
          {weeks.map((week) => (
            <MonthlyWeekRow
              key={week.key}
              week={week}
              currentMonth={currentMonth}
              maxEventRows={maxEventRows}
              fillHeight={fillHeight}
              dimOutsideMonthDays={dimOutsideMonthDays}
              showOutsideMonthDays={showOutsideMonthDays}
              highlightsByDate={highlightsByDate}
              onDayClick={onDayClick}
              onEventClick={onEventClick}
              getEventsForDate={getEventsForDate}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Week row with event lanes
interface MonthlyWeekRowProps {
  week: WeekData;
  currentMonth: Date;
  maxEventRows: number;
  fillHeight: boolean;
  dimOutsideMonthDays: boolean;
  showOutsideMonthDays: boolean;
  highlightsByDate: Map<string, DayHighlight[]>;
  onDayClick?: (date: Date, events: CalendarEvent[]) => void;
  onEventClick?: (event: CalendarEvent) => void;
  getEventsForDate: (date: Date) => CalendarEvent[];
}

const MonthlyWeekRow = React.memo(function MonthlyWeekRow({
  week,
  currentMonth,
  maxEventRows,
  fillHeight,
  dimOutsideMonthDays,
  showOutsideMonthDays,
  highlightsByDate,
  onDayClick,
  onEventClick,
  getEventsForDate,
}: MonthlyWeekRowProps) {
  // Group placements by lane
  const lanes = React.useMemo(() => {
    const laneMap = new Map<number, EventPlacement[]>();
    for (const placement of week.placements) {
      const existing = laneMap.get(placement.lane) ?? [];
      laneMap.set(placement.lane, [...existing, placement]);
    }
    return Array.from(laneMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([, placements]) => placements);
  }, [week.placements]);

  // Calculate placements per column to determine overflow per day (fixed overflow logic)
  const placementsPerColumn = React.useMemo(() => getPlacementsPerColumn(week.placements), [week.placements]);

  const visibleLanes = lanes.slice(0, maxEventRows);
  // Check if any column has overflow (more placements than maxEventRows)
  const hasAnyOverflow = placementsPerColumn.some((count) => count > maxEventRows);

  // Fixed event area height for consistent row heights
  const eventAreaHeight = maxEventRows * 24 + (hasAnyOverflow ? 24 : 0);

  // Minimum height to ensure overflow indicator is always visible
  // Day number (34px) + event lanes (22px each) + overflow row (24px)
  const minRowHeight = 34 + maxEventRows * 22 + 24;

  return (
    <div
      data-slot="monthly-week-row"
      data-fill-height={fillHeight || undefined}
      className={styles.weekRow}
      style={{ minHeight: fillHeight ? minRowHeight : undefined }}
    >
      {/* Day cells grid */}
      <div
        data-fill-height={fillHeight || undefined}
        className={styles.dayGrid}
      >
        {week.days.map((day, colIndex) => {
          const dayHighlights = highlightsByDate.get(formatDateKey(day)) ?? [];
          const dayEvents = getEventsForDate(day);
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isTodayDate = isToday(day);
          const columnPlacementCount = placementsPerColumn[colIndex] ?? 0;
          const hasOverflowInColumn = columnPlacementCount > maxEventRows;

          // If outside month and showOutsideMonthDays is false, render empty cell
          if (!isCurrentMonth && !showOutsideMonthDays) {
            return (
              <div
                key={formatDateKey(day)}
                data-fill-height={fillHeight || undefined}
                className={styles.dayEmpty}
              />
            );
          }

          return (
            <MonthlyDay
              key={formatDateKey(day)}
              date={day}
              isCurrentMonth={isCurrentMonth}
              isToday={isTodayDate}
              highlights={dayHighlights}
              eventsCount={dayEvents.length}
              hasOverflow={hasOverflowInColumn}
              maxEventRows={maxEventRows}
              eventAreaHeight={eventAreaHeight}
              fillHeight={fillHeight}
              dimOutsideMonthDays={dimOutsideMonthDays}
              onClick={() => onDayClick?.(day, dayEvents)}
            />
          );
        })}
      </div>

      {/* Event lanes overlay */}
      <div className={styles.eventLanes}>
        {visibleLanes.map((lanePlacements, laneIndex) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: Lane order is stable (sorted by lane number)
            key={laneIndex}
            className={styles.lane}
          >
            {lanePlacements.map((placement) => (
              <MonthlyEventBar
                key={placement.event.id}
                placement={placement}
                onEventClick={onEventClick}
              />
            ))}
          </div>
        ))}

        {/* Overflow indicators - show for each column that has overflow */}
        {hasAnyOverflow && (
          <div className={styles.overflowRow}>
            {week.days.map((day, colIndex) => {
              const dayEvents = getEventsForDate(day);
              const columnPlacementCount = placementsPerColumn[colIndex] ?? 0;
              const overflowCount = columnPlacementCount - maxEventRows;
              if (overflowCount <= 0)
                return (
                  <div
                    key={formatDateKey(day)}
                    className={styles.overflowCellEmpty}
                  />
                );
              return (
                <MonthlyOverflow
                  key={formatDateKey(day)}
                  date={day}
                  events={dayEvents}
                  count={overflowCount}
                  onEventClick={onEventClick}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

// Day cell
interface MonthlyDayProps extends Omit<React.ComponentProps<'div'>, 'onClick'> {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  highlights: DayHighlight[];
  eventsCount: number;
  hasOverflow: boolean;
  maxEventRows: number;
  eventAreaHeight: number;
  fillHeight: boolean;
  dimOutsideMonthDays: boolean;
  onClick?: () => void;
}

const MonthlyDay = React.memo(function MonthlyDay({
  className,
  date,
  isCurrentMonth,
  isToday: isTodayDate,
  highlights,
  eventsCount,
  hasOverflow,
  maxEventRows,
  eventAreaHeight,
  fillHeight,
  dimOutsideMonthDays,
  onClick,
  ...props
}: MonthlyDayProps) {
  // Determine the visual state
  const isOutsideMonth = !isCurrentMonth;
  const shouldDimOutside = isOutsideMonth && dimOutsideMonthDays;
  const state = isTodayDate ? 'today' : shouldDimOutside ? 'outsideMonth' : 'default';
  const dayNumberState = isTodayDate ? 'today' : highlights.length > 0 ? 'highlighted' : 'default';

  return (
    <div
      data-slot="monthly-day"
      data-state={state}
      data-interactive={!!onClick}
      data-fill-height={fillHeight || undefined}
      className={cn(styles.day, className)}
      style={!fillHeight ? { paddingBottom: `${eventAreaHeight + 4}px` } : undefined}
      onClick={onClick}
      {...props}
    >
      <div
        data-state={dayNumberState}
        className={styles.dayNumber}
        style={highlights[0]?.color ? ({ '--highlight-color': highlights[0].color } as React.CSSProperties) : undefined}
      >
        {date.getDate()}
      </div>
    </div>
  );
});

// Event bar (multi-day spanning)
interface MonthlyEventBarProps {
  placement: EventPlacement;
  onEventClick?: (event: CalendarEvent) => void;
}

const MonthlyEventBar = React.memo(function MonthlyEventBar({ placement, onEventClick }: MonthlyEventBarProps) {
  const { event, startCol, span, continuesFromPrev, continuesToNext } = placement;

  const position =
    span === 1 && !continuesFromPrev && !continuesToNext
      ? 'single'
      : continuesFromPrev && continuesToNext
        ? 'middle'
        : continuesFromPrev
          ? 'end'
          : continuesToNext
            ? 'start'
            : 'single';

  const color = (event.color ?? 'default') as EventColor;
  const isCustomColor = isCustomEventColor(color);

  return (
    <button
      type="button"
      data-slot="monthly-event-bar"
      data-color={isCustomColor ? 'default' : color}
      data-position={position}
      className={styles.eventBar}
      style={{
        // Explicit grid positioning: row 1 prevents CSS Grid from auto-creating rows
        gridRow: 1,
        gridColumn: `${startCol + 1} / span ${span}`,
        ...(isCustomColor ? { backgroundColor: `${color}20`, color } : {}),
      }}
      onClick={(e) => {
        e.stopPropagation();
        onEventClick?.(event);
      }}
    >
      {continuesFromPrev && <span className={styles.eventBarArrow}>&larr;</span>}
      <span className={styles.eventTitle}>{event.title}</span>
      {continuesToNext && <span className={styles.eventBarArrow}>&rarr;</span>}
    </button>
  );
});

// Single-day event (for use in overflow dialog)
export interface MonthlyEventProps extends Omit<React.ComponentProps<'button'>, 'color'> {
  event: CalendarEvent;
  color?: EventColor | (string & {});
  variant?: MonthlyEventVariant;
}

function MonthlyEvent({ className, event, color, variant = 'default', ...props }: MonthlyEventProps) {
  const eventColor = (event.color ?? color ?? 'default') as EventColor;
  const isCustomColor = isCustomEventColor(eventColor);

  return (
    <button
      type="button"
      data-slot="monthly-event"
      data-color={isCustomColor ? 'default' : eventColor}
      data-variant={variant}
      className={cn(styles.event, className)}
      style={isCustomColor ? { backgroundColor: `${eventColor}20`, color: eventColor } : undefined}
      {...props}
    >
      <span className={styles.eventTitle}>{event.title}</span>
    </button>
  );
}

// Event item for overflow dialog with better structure
interface OverflowEventItemProps {
  event: CalendarEvent;
  onEventClick?: (event: CalendarEvent) => void;
}

function OverflowEventItem({ event, onEventClick }: OverflowEventItemProps) {
  const eventColor = (event.color ?? 'default') as EventColor;
  const isCustomColor = isCustomEventColor(eventColor);

  const startDate = toDate(event.start);
  const endDate = event.end ? toDate(event.end) : null;
  const isMultiDay = endDate && differenceInDays(endDate, startDate) > 0;

  return (
    <button
      type="button"
      onClick={() => onEventClick?.(event)}
      className={styles.overflowItem}
    >
      {/* Color indicator */}
      <div
        data-color={isCustomColor ? 'default' : eventColor}
        className={styles.overflowItemColor}
        style={isCustomColor ? { backgroundColor: eventColor } : undefined}
      />

      {/* Event content */}
      <div className={styles.overflowItemContent}>
        <div className={styles.overflowItemTitle}>{event.title}</div>
        {isMultiDay && (
          <div className={styles.overflowItemDate}>
            {format(startDate, 'MMM d')} - {format(endDate, 'MMM d')}
          </div>
        )}
      </div>
    </button>
  );
}

// Overflow trigger with dialog
interface MonthlyOverflowProps {
  date: Date;
  events: CalendarEvent[];
  count: number;
  onEventClick?: (event: CalendarEvent) => void;
}

function MonthlyOverflow({ date, events, count, onEventClick }: MonthlyOverflowProps) {
  // Sort events by start date
  const sortedEvents = React.useMemo(() => {
    return [...events].sort((a, b) => toDate(a.start).getTime() - toDate(b.start).getTime());
  }, [events]);

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            data-slot="monthly-overflow"
            className={styles.overflowTrigger}
          />
        }
      >
        +{count} more
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className={styles.overflowDialogTitle}>
            <span className={styles.overflowDialogDay}>{format(date, 'd')}</span>
            <span className={styles.overflowDialogLabel}>{format(date, 'EEEE, MMMM yyyy')}</span>
          </DialogTitle>
          <DialogDescription>
            {events.length} event{events.length !== 1 ? 's' : ''} scheduled
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className={styles.overflowScrollArea}>
          <div className={styles.overflowList}>
            {sortedEvents.map((event) => (
              <OverflowEventItem
                key={event.id}
                event={event}
                onEventClick={onEventClick}
              />
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Exports
// ============================================================================

export { MonthlyCalendar, MonthlyContent, MonthlyEvent, MonthlyNav, MonthlyWeekdays };
