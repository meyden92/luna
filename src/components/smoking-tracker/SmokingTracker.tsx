import { useMutation, useQueryClient } from '@tanstack/react-query';
import { differenceInCalendarDays, differenceInMinutes, eachDayOfInterval, format, startOfDay, subDays } from 'date-fns';
import {
  Activity,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Cigarette,
  Circle,
  Clock,
  Edit3,
  Flame,
  Gauge,
  HeartPulse,
  LineChart as LineChartIcon,
  ListChecks,
  NotebookPen,
  Pill,
  Plus,
  ShieldCheck,
  Sparkles,
  Target,
  TimerReset,
  Trash2,
  TrendingDown,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import LineChart from '@/components/charting/LineChart';
import StackedBarChart from '@/components/charting/StackedBarChart';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { queryKeys } from '@/libs/query-keys';
import { cn } from '@/libs/utils';
import {
  type CreateNicotineEntryInput,
  createNicotineEntry,
  deleteNicotineEntry,
  type NicotineEntriesPayload,
  type NicotineEntryDTO,
  type NicotineKind,
  type UpdateNicotineEntryInput,
  updateNicotineEntry,
} from '@/server/fns/nicotine';

type PeriodKey = '7' | '30' | '90' | 'all';

type ParsedEntry = NicotineEntryDTO & {
  occurredAtDate: Date;
  timestamp: number;
  dayKey: string;
  hour: number;
};

type DailyDatum = {
  category: string;
  Rauchen: number;
  Nicorette: number;
};

type TrendDatum = {
  category: string;
  Rauchen: number;
  '7-Tage-Schnitt': number;
};

type HourDatum = {
  hour: number;
  smoking: number;
  nicorette: number;
};

type InsightTone = 'good' | 'watch' | 'neutral';

type Insight = {
  title: string;
  body: string;
  tone: InsightTone;
  icon: ComponentType<{ className?: string }>;
};

type RecoveryMilestone = {
  label: string;
  minutes: number;
  title: string;
  body: string;
  source: string;
};

type RecoveryMilestoneView = RecoveryMilestone & {
  reached: boolean;
  remainingMinutes: number | null;
};

const PERIOD_OPTIONS: Array<{ value: PeriodKey; label: string }> = [
  { value: '7', label: '7 Tage' },
  { value: '30', label: '30 Tage' },
  { value: '90', label: '90 Tage' },
  { value: 'all', label: 'Alles' },
];

const DAY_MS = 86_400_000;
const SMOKING_LABEL = 'Rauchen';
const NICORETTE_LABEL = 'Nicorette';

const CHART_COLORS = {
  Rauchen: '#ef4444',
  Nicorette: '#10b981',
  '7-Tage-Schnitt': '#0ea5e9',
};

const RECOVERY_MILESTONES: RecoveryMilestone[] = [
  {
    label: 'Minuten',
    minutes: 20,
    title: 'Herzfrequenz sinkt',
    body: 'Der Puls beginnt nach der letzten Zigarette wieder zu fallen.',
    source: 'ACS/CDC',
  },
  {
    label: '24 Stunden',
    minutes: 24 * 60,
    title: 'Rauchbelastung sinkt weiter',
    body: 'Ohne Nikotinersatz fällt Nikotin laut CDC nach etwa einem Tag auf null; mit Nicorette zählt hier vor allem, dass kein Tabakrauch hinzugekommen ist.',
    source: 'CDC',
  },
  {
    label: 'Einige Tage',
    minutes: 3 * 24 * 60,
    title: 'Kohlenmonoxid normalisiert sich',
    body: 'Der Kohlenmonoxidwert im Blut fällt auf ein Niveau wie bei Menschen, die nicht rauchen.',
    source: 'ACS/CDC',
  },
  {
    label: '1-12 Monate',
    minutes: 30 * 24 * 60,
    title: 'Atmung wird leichter',
    body: 'Husten und Kurzatmigkeit können im Verlauf der nächsten Monate deutlich abnehmen.',
    source: 'ACS/CDC',
  },
  {
    label: '1-2 Jahre',
    minutes: 365 * 24 * 60,
    title: 'Herzinfarktrisiko sinkt stark',
    body: 'Das Risiko für einen Herzinfarkt nimmt in diesem Zeitraum deutlich ab.',
    source: 'ACS/CDC',
  },
  {
    label: '3-6 Jahre',
    minutes: 3 * 365 * 24 * 60,
    title: 'Herzkrankheitsrisiko halbiert sich',
    body: 'Das zusätzliche Risiko für koronare Herzkrankheit sinkt ungefähr um die Hälfte.',
    source: 'CDC',
  },
  {
    label: '5-10 Jahre',
    minutes: 5 * 365 * 24 * 60,
    title: 'Schlaganfall- und Krebsrisiken sinken',
    body: 'Das Risiko für Schlaganfall und mehrere Krebsarten im Mund-, Rachen- und Kehlkopfbereich sinkt.',
    source: 'ACS/CDC',
  },
  {
    label: '10 Jahre',
    minutes: 10 * 365 * 24 * 60,
    title: 'Lungenkrebsrisiko deutlich niedriger',
    body: 'Das zusätzliche Lungenkrebsrisiko sinkt nach 10 bis 15 Jahren etwa um die Hälfte.',
    source: 'ACS/CDC',
  },
  {
    label: '15 Jahre',
    minutes: 15 * 365 * 24 * 60,
    title: 'Herzrisiko nahe Nichtraucher-Niveau',
    body: 'Das Risiko für koronare Herzkrankheit nähert sich dem von Menschen an, die nicht rauchen.',
    source: 'ACS/CDC',
  },
];

const asDayKey = (date: Date) => format(date, 'yyyy-MM-dd');

const parseEntry = (entry: NicotineEntryDTO): ParsedEntry => {
  const occurredAtDate = new Date(entry.occurredAt);
  return {
    ...entry,
    occurredAtDate,
    timestamp: occurredAtDate.getTime(),
    dayKey: asDayKey(occurredAtDate),
    hour: occurredAtDate.getHours(),
  };
};

const formatChartDate = (value: string | number | Date, includeYear = false) =>
  new Date(String(value)).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    ...(includeYear ? { year: '2-digit' } : {}),
  });

const formatDateTime = (date: Date) =>
  date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatSigned = (value: number) => (value > 0 ? `+${value}` : String(value));

const sortEntryDTOs = (entries: NicotineEntryDTO[]) =>
  entries.toSorted((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime());

const toDateTimeLocalValue = (date: Date) => {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
};

const average = (values: number[]) => {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const formatLiveDuration = (ms: number | null) => {
  if (ms === null) return 'Noch kein Eintrag';
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const clock = [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
  return days > 0 ? `${days}d ${clock}` : clock;
};

const formatMinutes = (minutes: number | null) => {
  if (minutes === null) return '-';
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded} Min`;
  const hours = Math.floor(rounded / 60);
  const restMinutes = rounded % 60;
  if (hours < 24) return restMinutes > 0 ? `${hours} Std ${restMinutes} Min` : `${hours} Std`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  const dayLabel = days === 1 ? 'Tag' : 'Tage';
  return restHours > 0 ? `${days} ${dayLabel} ${restHours} Std` : `${days} ${dayLabel}`;
};

const formatApproxDuration = (minutes: number | null) => {
  if (minutes === null) return '-';
  const rounded = Math.max(0, Math.ceil(minutes));
  const days = Math.ceil(rounded / (24 * 60));
  if (days < 2) return formatMinutes(rounded);
  if (days < 14) return `${days} Tage`;
  if (days < 60) return `${Math.ceil(days / 7)} Wochen`;
  if (days < 365) {
    const months = Math.ceil(days / 30);
    return `${months} ${months === 1 ? 'Monat' : 'Monate'}`;
  }
  const years = days / 365;
  const formattedYears = years.toLocaleString('de-DE', { maximumFractionDigits: years < 10 ? 1 : 0 });
  return `${formattedYears} ${formattedYears === '1' ? 'Jahr' : 'Jahre'}`;
};

const kindLabel = (kind: ParsedEntry['kind']) => (kind === 'smoking' ? SMOKING_LABEL : NICORETTE_LABEL);

function buildGapMap(entriesAscending: ParsedEntry[]) {
  const gaps = new Map<string, number>();
  for (let index = 1; index < entriesAscending.length; index += 1) {
    const previous = entriesAscending[index - 1];
    const current = entriesAscending[index];
    if (previous && current) {
      gaps.set(current.id, differenceInMinutes(current.occurredAtDate, previous.occurredAtDate));
    }
  }
  return gaps;
}

function buildDailyData(days: Date[], entries: ParsedEntry[]): DailyDatum[] {
  const counts = new Map<string, { smoking: number; nicorette: number }>();
  for (const day of days) {
    counts.set(asDayKey(day), { smoking: 0, nicorette: 0 });
  }
  for (const entry of entries) {
    const dayCounts = counts.get(entry.dayKey);
    if (dayCounts) {
      if (entry.kind === 'smoking') dayCounts.smoking += 1;
      else dayCounts.nicorette += 1;
    }
  }
  return days.map((day) => {
    const key = asDayKey(day);
    const dayCounts = counts.get(key);
    return {
      category: key,
      Rauchen: dayCounts?.smoking ?? 0,
      Nicorette: dayCounts?.nicorette ?? 0,
    };
  });
}

function buildTrendData(dailyData: DailyDatum[]): TrendDatum[] {
  return dailyData.map((day, index) => {
    const window = dailyData.slice(Math.max(0, index - 6), index + 1);
    const rollingAverage = average(window.map((item) => item.Rauchen)) ?? 0;
    return {
      category: day.category,
      Rauchen: day.Rauchen,
      '7-Tage-Schnitt': Number(rollingAverage.toFixed(2)),
    };
  });
}

function buildChartTickValues(dailyData: DailyDatum[]) {
  if (dailyData.length <= 12) return dailyData.map((day) => day.category);

  const maxTicks = dailyData.length <= 35 ? 8 : 9;
  const step = Math.max(1, Math.ceil((dailyData.length - 1) / (maxTicks - 1)));
  const ticks = dailyData
    .filter((_, index) => index === 0 || index === dailyData.length - 1 || index % step === 0)
    .map((day) => day.category);

  return Array.from(new Set(ticks));
}

function buildHourlyData(entries: ParsedEntry[]): HourDatum[] {
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, smoking: 0, nicorette: 0 }));
  for (const entry of entries) {
    const bucket = hours[entry.hour];
    if (bucket) {
      if (entry.kind === 'smoking') bucket.smoking += 1;
      else bucket.nicorette += 1;
    }
  }
  return hours;
}

function getMostActiveHour(hours: HourDatum[], kind: 'smoking' | 'nicorette') {
  const sorted = [...hours].sort((left, right) => right[kind] - left[kind]);
  const hour = sorted[0];
  return hour && hour[kind] > 0 ? hour.hour : null;
}

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
  tone = 'neutral',
}: {
  title: string;
  value: string;
  detail: string;
  icon: ComponentType<{ className?: string }>;
  tone?: 'rose' | 'emerald' | 'sky' | 'amber' | 'neutral';
}) {
  return (
    <div
      className={cn(
        'min-h-[8.5rem] rounded-xl border bg-card/80 p-4 shadow-sm',
        tone === 'rose' && 'border-rose-500/25 bg-rose-500/5',
        tone === 'emerald' && 'border-emerald-500/25 bg-emerald-500/5',
        tone === 'sky' && 'border-sky-500/25 bg-sky-500/5',
        tone === 'amber' && 'border-amber-500/25 bg-amber-500/5',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
        <span className="rounded-lg border border-border/70 bg-background/80 p-2">
          <Icon className="h-4 w-4 text-foreground/75" />
        </span>
      </div>
      <div className="mt-4 text-3xl font-semibold tabular-nums tracking-tight">{value}</div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const Icon = insight.icon;
  return (
    <div
      className={cn(
        'rounded-xl border bg-card/70 p-4',
        insight.tone === 'good' && 'border-emerald-500/25 bg-emerald-500/5',
        insight.tone === 'watch' && 'border-amber-500/25 bg-amber-500/5',
      )}
    >
      <div className="flex items-start gap-3">
        <span className="rounded-lg border border-border/70 bg-background/80 p-2">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{insight.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{insight.body}</p>
        </div>
      </div>
    </div>
  );
}

function SectionShell({
  title,
  description,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card/75 p-4 shadow-sm md:p-5">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-xl border border-border/70 bg-background p-2.5">
            <Icon className="h-5 w-5 text-foreground/80" />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function SmokingTracker({ data }: { data: NicotineEntriesPayload }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [period, setPeriod] = useState<PeriodKey>('30');
  const [nowMs, setNowMs] = useState(() => new Date(data.asOf).getTime());
  const [editingEntry, setEditingEntry] = useState<ParsedEntry | null>(null);
  const [entryToDelete, setEntryToDelete] = useState<ParsedEntry | null>(null);
  const [editKind, setEditKind] = useState<NicotineKind>('smoking');
  const [editNote, setEditNote] = useState('');
  const [editOccurredAt, setEditOccurredAt] = useState('');

  useEffect(() => {
    const updateNow = () => setNowMs(Date.now());
    updateNow();
    const interval = window.setInterval(updateNow, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const parsedEntries = useMemo(
    () => data.entries.map(parseEntry).toSorted((left, right) => right.timestamp - left.timestamp),
    [data.entries],
  );

  const analytics = useMemo(() => {
    const now = new Date(nowMs);
    const todayKey = asDayKey(now);
    const ascendingEntries = parsedEntries.toSorted((left, right) => left.timestamp - right.timestamp);
    const smokingEntries = parsedEntries.filter((entry) => entry.kind === 'smoking');
    const nicoretteEntries = parsedEntries.filter((entry) => entry.kind === 'nicorette');
    const ascendingSmokingEntries = smokingEntries.toSorted((left, right) => left.timestamp - right.timestamp);

    const firstEntry = ascendingEntries[0] ?? null;
    const lastEntry = parsedEntries[0] ?? null;
    const lastSmoking = smokingEntries[0] ?? null;
    const lastNicorette = nicoretteEntries[0] ?? null;

    const requestedPeriodDays = period === 'all' ? null : Number(period);
    const totalHistoryDays = firstEntry ? differenceInCalendarDays(startOfDay(now), startOfDay(firstEntry.occurredAtDate)) + 1 : 1;
    const periodDays = requestedPeriodDays ?? Math.max(1, totalHistoryDays);
    const periodStart = startOfDay(subDays(now, periodDays - 1));
    const periodStartMs = periodStart.getTime();
    const periodEntries = parsedEntries.filter((entry) => entry.timestamp >= periodStartMs && entry.timestamp <= nowMs);

    const previousStartMs = periodStartMs - periodDays * DAY_MS;
    const previousEntries =
      requestedPeriodDays === null
        ? []
        : parsedEntries.filter((entry) => entry.timestamp >= previousStartMs && entry.timestamp < periodStartMs);

    const days = eachDayOfInterval({ start: periodStart, end: now });
    const dailyData = buildDailyData(days, periodEntries);
    const trendData = buildTrendData(dailyData);
    const chartTickValues = buildChartTickValues(dailyData);
    const hourlyData = buildHourlyData(periodEntries);

    const periodSmoking = periodEntries.filter((entry) => entry.kind === 'smoking').length;
    const periodNicorette = periodEntries.filter((entry) => entry.kind === 'nicorette').length;
    const previousSmoking = previousEntries.filter((entry) => entry.kind === 'smoking').length;
    const todaySmoking = parsedEntries.filter((entry) => entry.dayKey === todayKey && entry.kind === 'smoking').length;
    const todayNicorette = parsedEntries.filter((entry) => entry.dayKey === todayKey && entry.kind === 'nicorette').length;
    const smokeFreeDays = dailyData.filter((day) => day.Rauchen === 0).length;
    const smokeFreeDayRate = dailyData.length > 0 ? Math.round((smokeFreeDays / dailyData.length) * 100) : 0;

    const smokingGaps = ascendingSmokingEntries.slice(1).map((entry, index) => {
      const previous = ascendingSmokingEntries[index];
      return previous ? differenceInMinutes(entry.occurredAtDate, previous.occurredAtDate) : 0;
    });
    const currentSmokeFreeMinutes = lastSmoking ? differenceInMinutes(now, lastSmoking.occurredAtDate) : null;
    const currentEntryMinutes = lastEntry ? differenceInMinutes(now, lastEntry.occurredAtDate) : null;
    const currentSmokeFreeMs = lastSmoking ? nowMs - lastSmoking.timestamp : null;
    const currentEntryMs = lastEntry ? nowMs - lastEntry.timestamp : null;
    const recoveryMilestones: RecoveryMilestoneView[] = RECOVERY_MILESTONES.map((milestone) => ({
      ...milestone,
      reached: currentSmokeFreeMinutes !== null && currentSmokeFreeMinutes >= milestone.minutes,
      remainingMinutes: currentSmokeFreeMinutes === null ? null : Math.max(0, milestone.minutes - currentSmokeFreeMinutes),
    }));
    const reachedRecoveryMilestones = recoveryMilestones.filter((milestone) => milestone.reached).length;
    const recoveryProgress = Math.round((reachedRecoveryMilestones / RECOVERY_MILESTONES.length) * 100);
    const nextRecoveryMilestone = recoveryMilestones.find((milestone) => !milestone.reached) ?? null;
    const longestGapMinutes = Math.max(...smokingGaps, currentSmokeFreeMinutes ?? 0);
    const averageGapMinutes = average(smokingGaps);
    const entryGapById = buildGapMap(ascendingEntries);
    const smokingGapById = buildGapMap(ascendingSmokingEntries);
    const busiestSmokingHour = getMostActiveHour(hourlyData, 'smoking');
    const busiestNicoretteHour = getMostActiveHour(hourlyData, 'nicorette');
    const smokingDelta = requestedPeriodDays === null ? null : periodSmoking - previousSmoking;
    const nicotineShare = periodSmoking + periodNicorette > 0 ? Math.round((periodNicorette / (periodSmoking + periodNicorette)) * 100) : 0;

    const insights: Insight[] = [];
    if (lastSmoking) {
      insights.push({
        title: 'Aktuelle rauchfreie Phase',
        body: `Du bist seit ${formatMinutes(currentSmokeFreeMinutes)} ohne Zigarette. Die beste gemessene Phase liegt bei ${formatMinutes(longestGapMinutes)}.`,
        tone: currentSmokeFreeMinutes && currentSmokeFreeMinutes >= (averageGapMinutes ?? 0) ? 'good' : 'neutral',
        icon: Trophy,
      });
    } else {
      insights.push({
        title: 'Startpunkt gesetzt',
        body: 'Noch keine Zigarette erfasst. Ab dem ersten Eintrag wird der Abstand automatisch ausgewertet.',
        tone: 'good',
        icon: Target,
      });
    }

    if (smokingDelta !== null) {
      insights.push({
        title: smokingDelta <= 0 ? 'Trend wirkt stabil' : 'Trend braucht Aufmerksamkeit',
        body:
          smokingDelta <= 0
            ? `Im aktuellen Zeitraum sind es ${Math.abs(smokingDelta)} weniger oder gleich viele Zigaretten als im Vergleichszeitraum.`
            : `Im aktuellen Zeitraum sind es ${smokingDelta} mehr Zigaretten als im Vergleichszeitraum.`,
        tone: smokingDelta <= 0 ? 'good' : 'watch',
        icon: smokingDelta <= 0 ? TrendingDown : TrendingUp,
      });
    }

    if (busiestSmokingHour !== null) {
      insights.push({
        title: 'Stärkstes Rauchfenster',
        body: `Die meisten Rauch-Einträge liegen um ${String(busiestSmokingHour).padStart(2, '0')}:00 Uhr. Das ist ein guter Kandidat für bewusste Vorbereitung.`,
        tone: 'watch',
        icon: Clock,
      });
    }

    if (periodNicorette > 0) {
      insights.push({
        title: 'Nicorette-Anteil',
        body: `${nicotineShare}% der Einträge im Zeitraum sind Nicorette. ${busiestNicoretteHour !== null ? `Häufigster Zeitpunkt: ${String(busiestNicoretteHour).padStart(2, '0')}:00 Uhr.` : ''}`,
        tone: 'neutral',
        icon: Pill,
      });
    }

    return {
      now,
      periodDays,
      dailyData,
      trendData,
      chartTickValues,
      hourlyData,
      insights,
      lastEntry,
      lastSmoking,
      lastNicorette,
      currentSmokeFreeMs,
      currentEntryMs,
      currentSmokeFreeMinutes,
      currentEntryMinutes,
      recoveryMilestones,
      reachedRecoveryMilestones,
      recoveryProgress,
      nextRecoveryMilestone,
      todaySmoking,
      todayNicorette,
      periodSmoking,
      periodNicorette,
      previousSmoking,
      smokingDelta,
      smokeFreeDayRate,
      longestGapMinutes,
      averageGapMinutes,
      entryGapById,
      smokingGapById,
      busiestSmokingHour,
      nicotineShare,
    };
  }, [nowMs, parsedEntries, period]);

  const { mutate: createEntry, isPending: isCreating } = useMutation({
    mutationFn: (input: CreateNicotineEntryInput) => createNicotineEntry({ data: input }),
    onSuccess: (entry) => {
      queryClient.setQueryData<NicotineEntriesPayload>(queryKeys.nicotine.entries, (current) => ({
        entries: current ? sortEntryDTOs([entry, ...current.entries]) : [entry],
        asOf: new Date().toISOString(),
      }));
      queryClient.invalidateQueries({ queryKey: queryKeys.nicotine.entries, refetchType: 'none' });
      if (entry.kind === 'smoking') setNote('');
      toast.success(entry.kind === 'smoking' ? 'Rauchen eingetragen' : 'Nicorette eingetragen', { richColors: true });
    },
    onError: (error) => {
      toast.error(error.message || 'Eintrag konnte nicht gespeichert werden', { richColors: true });
    },
  });

  const { mutate: updateEntry, isPending: isUpdating } = useMutation({
    mutationFn: (input: UpdateNicotineEntryInput) => updateNicotineEntry({ data: input }),
    onSuccess: (updatedEntry) => {
      queryClient.setQueryData<NicotineEntriesPayload>(queryKeys.nicotine.entries, (current) => ({
        entries: current
          ? sortEntryDTOs(current.entries.map((entry) => (entry.id === updatedEntry.id ? updatedEntry : entry)))
          : [updatedEntry],
        asOf: new Date().toISOString(),
      }));
      queryClient.invalidateQueries({ queryKey: queryKeys.nicotine.entries, refetchType: 'none' });
      setEditingEntry(null);
      toast.success('Eintrag aktualisiert', { richColors: true });
    },
    onError: (error) => {
      toast.error(error.message || 'Eintrag konnte nicht aktualisiert werden', { richColors: true });
    },
  });

  const { mutate: removeEntry, isPending: isDeleting } = useMutation({
    mutationFn: (id: string) => deleteNicotineEntry({ data: { id } }),
    onSuccess: ({ id }) => {
      queryClient.setQueryData<NicotineEntriesPayload>(queryKeys.nicotine.entries, (current) => ({
        entries: current ? current.entries.filter((entry) => entry.id !== id) : [],
        asOf: new Date().toISOString(),
      }));
      queryClient.invalidateQueries({ queryKey: queryKeys.nicotine.entries, refetchType: 'none' });
      setEntryToDelete(null);
      toast.success('Eintrag gelöscht', { richColors: true });
    },
    onError: (error) => {
      toast.error(error.message || 'Eintrag konnte nicht gelöscht werden', { richColors: true });
    },
  });

  const submitSmoking = () => {
    createEntry({ kind: 'smoking', note: note.trim() || undefined });
  };

  const submitNicorette = () => {
    createEntry({ kind: 'nicorette' });
  };

  const openEditDialog = (entry: ParsedEntry) => {
    setEditingEntry(entry);
    setEditKind(entry.kind);
    setEditNote(entry.note ?? '');
    setEditOccurredAt(toDateTimeLocalValue(entry.occurredAtDate));
  };

  const submitEdit = () => {
    if (!editingEntry) return;
    if (!editOccurredAt) {
      toast.error('Bitte Datum und Uhrzeit setzen', { richColors: true });
      return;
    }

    const occurredAt = new Date(editOccurredAt);
    if (Number.isNaN(occurredAt.getTime())) {
      toast.error('Datum und Uhrzeit sind ungültig', { richColors: true });
      return;
    }

    updateEntry({
      id: editingEntry.id,
      kind: editKind,
      note: editKind === 'smoking' ? editNote.trim() || undefined : undefined,
      occurredAt: occurredAt.toISOString(),
    });
  };

  const maxHourlyTotal = Math.max(...analytics.hourlyData.map((hour) => hour.smoking + hour.nicorette), 1);
  const recentEntries = parsedEntries.slice(0, 40);
  const periodLabel = PERIOD_OPTIONS.find((item) => item.value === period)?.label ?? '30 Tage';
  const chartDateFormatter = (value: string | number | Date) => formatChartDate(value, analytics.periodDays > 180);
  const showDenseChartDetails = analytics.dailyData.length <= 35;

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-10">
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-card p-5 shadow-sm md:p-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(16,185,129,0.14),transparent_30%),radial-gradient(circle_at_90%_0%,rgba(239,68,68,0.13),transparent_26%)]" />
        <div className="relative z-10 grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div className="min-w-0">
            <Badge
              variant="outline"
              className="mb-4 bg-background/75"
            >
              Privates Rauchprotokoll
            </Badge>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">Rauchfrei-Rhythmus</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
              {analytics.lastEntry
                ? `Letzter Eintrag: ${kindLabel(analytics.lastEntry.kind)} am ${formatDateTime(analytics.lastEntry.occurredAtDate)}.`
                : 'Noch keine Einträge vorhanden.'}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-rose-500/20 bg-background/78 p-4 shadow-sm backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Seit letzter Zigarette</span>
                <Cigarette className="h-4 w-4 text-rose-500" />
              </div>
              <div className="mt-3 font-mono text-3xl font-semibold tracking-tight md:text-4xl">
                {formatLiveDuration(analytics.currentSmokeFreeMs)}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {analytics.lastSmoking ? formatDateTime(analytics.lastSmoking.occurredAtDate) : 'Wartet auf den ersten Rauch-Eintrag'}
              </p>
            </div>

            <div className="rounded-xl border border-emerald-500/20 bg-background/78 p-4 shadow-sm backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Seit letztem Eintrag</span>
                <TimerReset className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="mt-3 font-mono text-3xl font-semibold tracking-tight md:text-4xl">
                {formatLiveDuration(analytics.currentEntryMs)}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {analytics.lastEntry ? `${kindLabel(analytics.lastEntry.kind)} wurde zuletzt erfasst` : 'Bereit für den ersten Eintrag'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-border/70 bg-card/75 p-4 shadow-sm md:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Jetzt erfassen</h2>
              <p className="text-sm text-muted-foreground">Zeitstempel wird beim Speichern gesetzt.</p>
            </div>
            <NotebookPen className="h-5 w-5 text-muted-foreground" />
          </div>

          <div className="mt-4 space-y-3">
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optionale Notiz zum Rauch-Eintrag"
              maxLength={500}
              className="min-h-24"
            />
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>{note.trim().length > 0 ? 'Notiz wird nur bei Rauchen gespeichert' : 'Nicorette wird ohne Notiz gespeichert'}</span>
              <span className="font-mono tabular-nums">{note.length}/500</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                type="button"
                size="lg"
                variant="destructive"
                onClick={submitSmoking}
                disabled={isCreating}
                className="justify-start"
              >
                <Plus className="h-4 w-4" />
                Rauchen
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                onClick={submitNicorette}
                disabled={isCreating}
                className="justify-start border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"
              >
                <Pill className="h-4 w-4" />
                Nicorette
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <MetricCard
            title="Heute Rauchen"
            value={String(analytics.todaySmoking)}
            detail={`${analytics.todayNicorette} Nicorette heute`}
            icon={Cigarette}
            tone="rose"
          />
          <MetricCard
            title={`Rauchen ${periodLabel}`}
            value={String(analytics.periodSmoking)}
            detail={
              analytics.smokingDelta === null
                ? `${analytics.periodNicorette} Nicorette im Gesamtverlauf`
                : `${formatSigned(analytics.smokingDelta)} gegenüber vorherigem Zeitraum`
            }
            icon={analytics.smokingDelta !== null && analytics.smokingDelta <= 0 ? TrendingDown : TrendingUp}
            tone={analytics.smokingDelta !== null && analytics.smokingDelta <= 0 ? 'emerald' : 'amber'}
          />
          <MetricCard
            title="Durchschnittlicher Abstand"
            value={formatMinutes(analytics.averageGapMinutes)}
            detail="Zwischen zwei Rauch-Einträgen"
            icon={Gauge}
            tone="sky"
          />
          <MetricCard
            title="Rauchfreie Tage"
            value={`${analytics.smokeFreeDayRate}%`}
            detail={`${analytics.periodDays} Tage im betrachteten Zeitraum`}
            icon={CalendarDays}
            tone="emerald"
          />
        </div>
      </section>

      <SectionShell
        title="Kernwerte"
        description="Kompakte Orientierung für den ausgewählten Zeitraum."
        icon={Gauge}
      >
        <div className="grid gap-3 md:grid-cols-4">
          <MetricCard
            title="Aktuelle Phase"
            value={formatMinutes(analytics.currentSmokeFreeMinutes)}
            detail="Ohne Zigarette"
            icon={Flame}
            tone="rose"
          />
          <MetricCard
            title="Beste Phase"
            value={formatMinutes(analytics.longestGapMinutes)}
            detail="Längster Abstand ohne Zigarette"
            icon={Trophy}
            tone="amber"
          />
          <MetricCard
            title="Nicorette-Anteil"
            value={`${analytics.nicotineShare}%`}
            detail={`${analytics.periodNicorette} Einträge im Zeitraum`}
            icon={HeartPulse}
            tone="emerald"
          />
          <MetricCard
            title="Aktiver Zeitraum"
            value={periodLabel}
            detail={
              analytics.busiestSmokingHour === null
                ? 'Noch kein Rauchfenster erkennbar'
                : `Peak um ${String(analytics.busiestSmokingHour).padStart(2, '0')}:00 Uhr`
            }
            icon={Activity}
            tone="neutral"
          />
        </div>
      </SectionShell>

      <SectionShell
        title="Körperliche Erholung"
        description="Meilensteine seit der letzten erfassten Zigarette."
        icon={HeartPulse}
      >
        <div className="grid gap-4 xl:grid-cols-[0.72fr_1.28fr]">
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Erreicht</p>
                <div className="mt-3 text-4xl font-semibold tabular-nums tracking-tight">
                  {analytics.reachedRecoveryMilestones}/{analytics.recoveryMilestones.length}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">wissenschaftliche Rauchstopp-Meilensteine</p>
              </div>
              <span className="rounded-xl border border-emerald-500/30 bg-background/80 p-2.5 text-emerald-600 dark:text-emerald-300">
                <ShieldCheck className="h-5 w-5" />
              </span>
            </div>

            <div className="mt-5 h-2 rounded-full bg-background">
              <div
                className="h-2 rounded-full bg-emerald-500 transition-all"
                style={{ width: `${analytics.recoveryProgress}%` }}
              />
            </div>

            <div className="mt-5 rounded-lg border border-border/70 bg-background/70 p-4">
              {analytics.nextRecoveryMilestone ? (
                <>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Nächster Meilenstein</p>
                  <h3 className="mt-2 text-base font-semibold">{analytics.nextRecoveryMilestone.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {analytics.currentSmokeFreeMinutes === null
                      ? 'Startet mit dem ersten Rauch-Eintrag.'
                      : `Noch ca. ${formatApproxDuration(analytics.nextRecoveryMilestone.remainingMinutes)} bis ${analytics.nextRecoveryMilestone.label}.`}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Langfristig erreicht</p>
                  <h3 className="mt-2 text-base font-semibold">Alle Meilensteine markiert</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Der Fokus liegt jetzt auf Stabilität und Rückfallprävention.</p>
                </>
              )}
            </div>

            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Richtwerte aus medizinischen Übersichten. Individuelle Erholung hängt von Vorgeschichte, Konsum und Begleiterkrankungen ab.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {analytics.recoveryMilestones.map((milestone) => (
              <div
                key={milestone.label}
                className={cn(
                  'rounded-xl border border-border/70 bg-background/55 p-4',
                  milestone.reached && 'border-emerald-500/25 bg-emerald-500/5',
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      'mt-0.5 rounded-full border border-border/70 bg-card p-1.5',
                      milestone.reached && 'border-emerald-500/30 text-emerald-600 dark:text-emerald-300',
                    )}
                  >
                    {milestone.reached ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{milestone.label}</Badge>
                      {milestone.reached ? (
                        <Badge className="bg-emerald-500 text-white hover:bg-emerald-500">erreicht</Badge>
                      ) : analytics.currentSmokeFreeMinutes === null ? null : (
                        <span className="text-xs text-muted-foreground">noch ca. {formatApproxDuration(milestone.remainingMinutes)}</span>
                      )}
                    </div>
                    <h3 className="mt-3 text-sm font-semibold">{milestone.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{milestone.body}</p>
                    <p className="mt-3 text-xs text-muted-foreground">Quelle: {milestone.source}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </SectionShell>

      <SectionShell
        title="Analyse"
        description="Verlauf, Vergleich und gleitender 7-Tage-Schnitt."
        icon={BarChart3}
        action={
          <div className="flex flex-wrap gap-2">
            {PERIOD_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={period === option.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPeriod(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        }
      >
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="min-h-[22rem] rounded-xl border border-border/60 bg-background/55 p-3">
            <StackedBarChart<DailyDatum>
              data={analytics.dailyData}
              stacked={false}
              showLegend
              summarizeTooltip
              formatIndex={chartDateFormatter}
              formatValue={(value) => value.toLocaleString('de-DE', { maximumFractionDigits: 0 })}
              xTickValues={analytics.chartTickValues}
              height={330}
              seriesColors={CHART_COLORS}
              padding={0.28}
              innerPadding={2}
              borderRadius={4}
              enableLabel={analytics.dailyData.length <= 14}
            />
          </div>
          <div className="min-h-[22rem] rounded-xl border border-border/60 bg-background/55 p-3">
            <LineChart<TrendDatum>
              data={analytics.trendData}
              showLegend
              summarizeTooltip
              curve="monotoneX"
              pointSize={showDenseChartDetails ? 5 : 0}
              height={330}
              formatIndex={chartDateFormatter}
              formatValue={(value) => value.toLocaleString('de-DE', { maximumFractionDigits: 1 })}
              xTickValues={analytics.chartTickValues}
              seriesColors={CHART_COLORS}
              crosshairColor="#0ea5e9"
              hoverBandColor="rgba(14,165,233,0.08)"
              enablePoints={showDenseChartDetails}
            />
          </div>
        </div>
      </SectionShell>

      <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <SectionShell
          title="Tagesrhythmus"
          description="Verteilung nach Uhrzeit."
          icon={LineChartIcon}
        >
          <div className="grid grid-cols-12 gap-1.5 md:grid-cols-[repeat(24,minmax(0,1fr))]">
            {analytics.hourlyData.map((hour) => {
              const total = hour.smoking + hour.nicorette;
              const height = total === 0 ? 10 : 14 + Math.round((total / maxHourlyTotal) * 70);
              return (
                <div
                  key={hour.hour}
                  className="flex min-w-0 flex-col items-center gap-2"
                >
                  <div className="flex h-24 w-full items-end justify-center rounded-lg border border-border/60 bg-background/60 px-1 pb-1">
                    <div
                      className="w-full max-w-5 rounded-md bg-gradient-to-t from-rose-500 via-rose-400 to-emerald-400"
                      style={{ height }}
                      title={`${String(hour.hour).padStart(2, '0')}:00 - ${hour.smoking} Rauchen, ${hour.nicorette} Nicorette`}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">{String(hour.hour).padStart(2, '0')}</span>
                </div>
              );
            })}
          </div>
        </SectionShell>

        <SectionShell
          title="Lesbare Einsichten"
          description="Aus der aktuellen Zeitreihe berechnet."
          icon={Sparkles}
        >
          <div className="grid gap-3">
            {analytics.insights.map((insight) => (
              <InsightCard
                key={insight.title}
                insight={insight}
              />
            ))}
          </div>
        </SectionShell>
      </div>

      <SectionShell
        title="Einträge verwalten"
        description="Letzte 40 Einträge mit Korrektur- und Löschfunktion."
        icon={ListChecks}
      >
        {recentEntries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-background/50 p-8 text-center">
            <p className="text-sm font-medium">Noch keine Einträge vorhanden</p>
            <p className="mt-1 text-sm text-muted-foreground">Der Verlauf füllt sich automatisch nach der ersten Erfassung.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zeit</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Notiz</TableHead>
                  <TableHead className="text-right">Seit letztem Eintrag</TableHead>
                  <TableHead className="text-right">Seit letzter Zigarette</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentEntries.map((entry) => {
                  const entryGap = analytics.entryGapById.get(entry.id) ?? null;
                  const smokeGap = entry.kind === 'smoking' ? (analytics.smokingGapById.get(entry.id) ?? null) : null;
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap font-medium">{formatDateTime(entry.occurredAtDate)}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            entry.kind === 'smoking'
                              ? 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                          )}
                        >
                          {entry.kind === 'smoking' ? <Cigarette className="h-3 w-3" /> : <Pill className="h-3 w-3" />}
                          {kindLabel(entry.kind)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[22rem] truncate text-muted-foreground">{entry.note || '-'}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">{formatMinutes(entryGap)}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">{formatMinutes(smokeGap)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Eintrag bearbeiten"
                            onClick={() => openEditDialog(entry)}
                          >
                            <Edit3 className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Eintrag löschen"
                            onClick={() => setEntryToDelete(entry)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionShell>

      <Dialog
        open={editingEntry !== null}
        onOpenChange={(open) => {
          if (!open) setEditingEntry(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eintrag bearbeiten</DialogTitle>
            <DialogDescription>
              Typ und Zeitpunkt können korrigiert werden. Notizen werden nur für Rauch-Einträge gespeichert.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <label
                htmlFor="nicotine-entry-kind"
                className="text-sm font-medium"
              >
                Typ
              </label>
              <Select
                value={editKind}
                onValueChange={(value) => setEditKind(value as NicotineKind)}
              >
                <SelectTrigger
                  id="nicotine-entry-kind"
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="smoking">
                    <Cigarette className="h-4 w-4" />
                    Rauchen
                  </SelectItem>
                  <SelectItem value="nicorette">
                    <Pill className="h-4 w-4" />
                    Nicorette
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <label
                htmlFor="nicotine-entry-time"
                className="text-sm font-medium"
              >
                Zeitpunkt
              </label>
              <Input
                id="nicotine-entry-time"
                type="datetime-local"
                value={editOccurredAt}
                onChange={(event) => setEditOccurredAt(event.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <label
                htmlFor="nicotine-entry-note"
                className="text-sm font-medium"
              >
                Notiz
              </label>
              <Textarea
                id="nicotine-entry-note"
                value={editNote}
                onChange={(event) => setEditNote(event.target.value)}
                disabled={editKind === 'nicorette'}
                maxLength={500}
                className="min-h-24"
                placeholder={editKind === 'nicorette' ? 'Nicorette speichert nur den Zeitstempel' : 'Optionale Notiz'}
              />
              <div className="flex justify-end text-xs text-muted-foreground">
                <span className="font-mono tabular-nums">{editNote.length}/500</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingEntry(null)}
              disabled={isUpdating}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              onClick={submitEdit}
              disabled={isUpdating}
            >
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={entryToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setEntryToDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eintrag löschen</DialogTitle>
            <DialogDescription>
              {entryToDelete
                ? `${kindLabel(entryToDelete.kind)} vom ${formatDateTime(entryToDelete.occurredAtDate)} wird dauerhaft entfernt.`
                : 'Dieser Eintrag wird dauerhaft entfernt.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEntryToDelete(null)}
              disabled={isDeleting}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (entryToDelete) removeEntry(entryToDelete.id);
              }}
              disabled={isDeleting}
            >
              Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
