import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { format, startOfMonth } from 'date-fns';
import { useState } from 'react';
import { type CalendarEvent, MonthlyCalendar, MonthlyContent, MonthlyNav } from '@/components/ui/calendar-view';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { queryKeys } from '@/libs/query-keys';
import { cn } from '@/libs/utils';
import { getMockCalendar } from '@/server/fns/system';
import styles from './calendar.module.css';

interface CalendarApiResponse {
  year: number;
  month: number;
  events: CalendarEvent[];
  delay: number;
  generatedAt: string;
}

async function fetchCalendarEvents(year: number, month: number): Promise<CalendarApiResponse> {
  return getMockCalendar({ data: { year, month } }) as Promise<CalendarApiResponse>;
}

const EVENT_COLORS = ['primary', 'secondary', 'success', 'warning', 'destructive'] as const;

export const Route = createFileRoute('/_dashboard/preview/calendar')({
  head: () => ({ meta: [{ title: 'Calendar | LunaShare' }] }),
  component: CalendarPreviewPage,
});

function CalendarPreviewPage() {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [dimOutsideMonthDays, setDimOutsideMonthDays] = useState(true);
  const [showOutsideMonthDays, setShowOutsideMonthDays] = useState(true);
  const [containerHeight, setContainerHeight] = useState('900');
  const [containerWidth, setContainerWidth] = useState('');

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: queryKeys.dashboard.calendarEvents(year, month),
    queryFn: () => fetchCalendarEvents(year, month),
    staleTime: 1000 * 60 * 5,
  });

  const containerStyle: React.CSSProperties = {
    height: containerHeight ? `${containerHeight}px` : undefined,
    width: containerWidth ? `${containerWidth}px` : undefined,
  };

  return (
    <section className="container pad-y-8">
      <div className={styles.header}>
        <h1 className="type-2xl weight-bold">Calendar Preview</h1>
        <p className={styles.subtitle}>Testing the MonthlyCalendar component with mock data from API</p>
      </div>

      <div className={styles.layout}>
        <Card
          className={styles.calendarCard}
          style={containerStyle}
        >
          <CardHeader className={styles.calendarCardHeader}>
            <div className={styles.calendarCardHeaderRow}>
              <div>
                <CardTitle>Events Calendar</CardTitle>
                <CardDescription>
                  {error ? (
                    <span className={styles.errorText}>Error loading events</span>
                  ) : data ? (
                    <>
                      {data.events.length} events loaded in {data.delay}ms
                    </>
                  ) : (
                    'Loading events...'
                  )}
                </CardDescription>
              </div>
              {isFetching && (
                <div className={styles.fetching}>
                  <div className={styles.fetchingDot} />
                  {isLoading ? 'Loading...' : 'Updating...'}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className={styles.calendarCardContent}>
            <MonthlyCalendar
              currentMonth={currentMonth}
              onCurrentMonthChange={(d) => setCurrentMonth(startOfMonth(d))}
              events={data?.events ?? []}
              weekStartsOn={1}
              maxEventRows={3}
              dimOutsideMonthDays={dimOutsideMonthDays}
              showOutsideMonthDays={showOutsideMonthDays}
              onDayClick={(date, events) => {
                console.log('Day clicked:', format(date, 'yyyy-MM-dd'), events);
              }}
              onEventClick={(event) => {
                console.log('Event clicked:', event);
              }}
            >
              <MonthlyNav showTodayButton />
              <MonthlyContent />
            </MonthlyCalendar>
          </CardContent>
        </Card>

        <div className={styles.rail}>
          <Card>
            <CardHeader>
              <CardTitle className="type-base">Container Size</CardTitle>
              <CardDescription>Test different container dimensions</CardDescription>
            </CardHeader>
            <CardContent className="stack space-4">
              <div className="stack space-2">
                <Label
                  htmlFor="containerHeight"
                  className={styles.fieldLabel}
                >
                  Height (px)
                </Label>
                <Input
                  id="containerHeight"
                  type="number"
                  placeholder="Auto"
                  value={containerHeight}
                  onChange={(e) => setContainerHeight(e.target.value)}
                  min={200}
                  max={2000}
                />
              </div>
              <div className="stack space-2">
                <Label
                  htmlFor="containerWidth"
                  className={styles.fieldLabel}
                >
                  Width (px)
                </Label>
                <Input
                  id="containerWidth"
                  type="number"
                  placeholder="Auto (fill available)"
                  value={containerWidth}
                  onChange={(e) => setContainerWidth(e.target.value)}
                  min={300}
                  max={2000}
                />
              </div>
              <p className="type-xs">
                Current: {containerHeight || 'auto'}px × {containerWidth || 'auto'}px
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="type-base">Layout Options</CardTitle>
            </CardHeader>
            <CardContent className="stack space-4">
              <div className={styles.rowBetween}>
                <Label
                  htmlFor="dimOutsideMonthDays"
                  className={styles.fieldLabel}
                >
                  Dim outside month days
                </Label>
                <Switch
                  id="dimOutsideMonthDays"
                  checked={dimOutsideMonthDays}
                  onCheckedChange={setDimOutsideMonthDays}
                />
              </div>
              <div className={styles.rowBetween}>
                <Label
                  htmlFor="showOutsideMonthDays"
                  className={styles.fieldLabel}
                >
                  Show outside month days
                </Label>
                <Switch
                  id="showOutsideMonthDays"
                  checked={showOutsideMonthDays}
                  onCheckedChange={setShowOutsideMonthDays}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="type-base">API Info</CardTitle>
            </CardHeader>
            <CardContent className="stack space-3 type-sm">
              <div className={styles.infoRow}>
                <span>Endpoint:</span>
                <code className={styles.code}>/api/mock-calendar</code>
              </div>
              <div className={styles.infoRow}>
                <span>Year:</span>
                <span className={styles.infoValue}>{year}</span>
              </div>
              <div className={styles.infoRow}>
                <span>Month:</span>
                <span className={styles.infoValue}>
                  {month} ({format(currentMonth, 'MMMM')})
                </span>
              </div>
              {data && (
                <>
                  <div className={styles.infoRow}>
                    <span>Events:</span>
                    <span className={styles.infoValue}>{data.events.length}</span>
                  </div>
                  <div className={styles.infoRow}>
                    <span>Simulated delay:</span>
                    <span className={styles.infoValue}>{data.delay}ms</span>
                  </div>
                  <div className={styles.infoRow}>
                    <span>Generated:</span>
                    <span className={cn(styles.infoValue, 'type-xs')}>{format(new Date(data.generatedAt), 'HH:mm:ss')}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="type-base">Features Demo</CardTitle>
            </CardHeader>
            <CardContent className="stack space-2 type-sm">
              <p>This calendar demonstrates:</p>
              <ul className={cn('stack space-1', styles.featureList)}>
                <li>TanStack Query data fetching</li>
                <li>Multi-day event spanning</li>
                <li>Event lane collision avoidance</li>
                <li>Overflow dialog for busy days</li>
                <li>No layout shift on load</li>
                <li>Month navigation with caching</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="type-base">Event Colors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="stack space-2">
                {EVENT_COLORS.map((color) => (
                  <div
                    key={color}
                    className="cluster space-2"
                  >
                    <div
                      className={styles.swatch}
                      style={{ '--swatch-color': `var(--${color})` } as React.CSSProperties}
                    />
                    <span className={cn('type-sm', styles.capitalize)}>{color}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
