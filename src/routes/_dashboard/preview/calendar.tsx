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
import { getMockCalendar } from '@/server/fns/system';

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
    <section className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Calendar Preview</h1>
        <p className="text-muted-foreground mt-1">Testing the MonthlyCalendar component with mock data from API</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card
          className="flex flex-col"
          style={containerStyle}
        >
          <CardHeader className="pb-2 shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Events Calendar</CardTitle>
                <CardDescription>
                  {error ? (
                    <span className="text-destructive">Error loading events</span>
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
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  {isLoading ? 'Loading...' : 'Updating...'}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 min-h-0">
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

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Container Size</CardTitle>
              <CardDescription>Test different container dimensions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label
                  htmlFor="containerHeight"
                  className="text-sm"
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
              <div className="space-y-2">
                <Label
                  htmlFor="containerWidth"
                  className="text-sm"
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
              <p className="text-xs text-muted-foreground">
                Current: {containerHeight || 'auto'}px × {containerWidth || 'auto'}px
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Layout Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="dimOutsideMonthDays"
                  className="text-sm"
                >
                  Dim outside month days
                </Label>
                <Switch
                  id="dimOutsideMonthDays"
                  checked={dimOutsideMonthDays}
                  onCheckedChange={setDimOutsideMonthDays}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="showOutsideMonthDays"
                  className="text-sm"
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
              <CardTitle className="text-base">API Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">Endpoint:</span>
                <code className="ml-2 text-xs bg-muted px-1.5 py-0.5 rounded">/api/mock-calendar</code>
              </div>
              <div>
                <span className="text-muted-foreground">Year:</span>
                <span className="ml-2 font-medium">{year}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Month:</span>
                <span className="ml-2 font-medium">
                  {month} ({format(currentMonth, 'MMMM')})
                </span>
              </div>
              {data && (
                <>
                  <div>
                    <span className="text-muted-foreground">Events:</span>
                    <span className="ml-2 font-medium">{data.events.length}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Simulated delay:</span>
                    <span className="ml-2 font-medium">{data.delay}ms</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Generated:</span>
                    <span className="ml-2 font-medium text-xs">{format(new Date(data.generatedAt), 'HH:mm:ss')}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Features Demo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>This calendar demonstrates:</p>
              <ul className="list-disc list-inside space-y-1">
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
              <CardTitle className="text-base">Event Colors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(['primary', 'secondary', 'success', 'warning', 'destructive'] as const).map((color) => (
                  <div
                    key={color}
                    className="flex items-center gap-2"
                  >
                    <div
                      className={`h-4 w-4 rounded ${
                        color === 'primary'
                          ? 'bg-primary/20'
                          : color === 'secondary'
                            ? 'bg-secondary/20'
                            : color === 'success'
                              ? 'bg-green-500/20'
                              : color === 'warning'
                                ? 'bg-yellow-500/20'
                                : 'bg-destructive/20'
                      }`}
                    />
                    <span className="text-sm capitalize">{color}</span>
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
