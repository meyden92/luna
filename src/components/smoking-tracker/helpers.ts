import { differenceInMinutes, format } from 'date-fns';
import type { ComponentType } from 'react';
import type { NicotineEntryDTO } from '@/server/fns/nicotine';

export type PeriodKey = '7' | '30' | '90' | 'all';

export type ParsedEntry = NicotineEntryDTO & {
  occurredAtDate: Date;
  timestamp: number;
  dayKey: string;
  hour: number;
};

export type DailyDatum = {
  category: string;
  Rauchen: number;
  Nicorette: number;
};

export type TrendDatum = {
  category: string;
  Rauchen: number;
  '7-Tage-Schnitt': number;
};

export type HourDatum = {
  hour: number;
  smoking: number;
  nicorette: number;
};

export type InsightTone = 'good' | 'watch' | 'neutral';

export type Insight = {
  title: string;
  body: string;
  tone: InsightTone;
  icon: ComponentType<{ className?: string }>;
};

export type RecoveryMilestone = {
  label: string;
  minutes: number;
  title: string;
  body: string;
  source: string;
};

export type RecoveryMilestoneView = RecoveryMilestone & {
  reached: boolean;
  remainingMinutes: number | null;
};

export const PERIOD_OPTIONS: Array<{ value: PeriodKey; label: string }> = [
  { value: '7', label: '7 Tage' },
  { value: '30', label: '30 Tage' },
  { value: '90', label: '90 Tage' },
  { value: 'all', label: 'Alles' },
];

export const DAY_MS = 86_400_000;
export const SMOKING_LABEL = 'Rauchen';
export const NICORETTE_LABEL = 'Nicorette';

export const CHART_COLORS = {
  Rauchen: '#ef4444',
  Nicorette: '#10b981',
  '7-Tage-Schnitt': '#0ea5e9',
};

export const RECOVERY_MILESTONES: RecoveryMilestone[] = [
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

export const asDayKey = (date: Date) => format(date, 'yyyy-MM-dd');

export const parseEntry = (entry: NicotineEntryDTO): ParsedEntry => {
  const occurredAtDate = new Date(entry.occurredAt);
  return {
    ...entry,
    occurredAtDate,
    timestamp: occurredAtDate.getTime(),
    dayKey: asDayKey(occurredAtDate),
    hour: occurredAtDate.getHours(),
  };
};

export const formatChartDate = (value: string | number | Date, includeYear = false) =>
  new Date(String(value)).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    ...(includeYear ? { year: '2-digit' } : {}),
  });

export const formatDateTime = (date: Date) =>
  date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export const formatSigned = (value: number) => (value > 0 ? `+${value}` : String(value));

export const sortEntryDTOs = (entries: NicotineEntryDTO[]) =>
  entries.toSorted((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime());

export const toDateTimeLocalValue = (date: Date) => {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
};

export const average = (values: number[]) => {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

export const formatLiveDuration = (ms: number | null) => {
  if (ms === null) return 'Noch kein Eintrag';
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const clock = [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
  return days > 0 ? `${days}d ${clock}` : clock;
};

export const formatMinutes = (minutes: number | null) => {
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

export const formatApproxDuration = (minutes: number | null) => {
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

export const kindLabel = (kind: ParsedEntry['kind']) => (kind === 'smoking' ? SMOKING_LABEL : NICORETTE_LABEL);

/** Minutes between each entry and the one before it, keyed by the later entry's id. */
export function buildGapMap(entriesAscending: ParsedEntry[]) {
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

export function buildDailyData(days: Date[], entries: ParsedEntry[]): DailyDatum[] {
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

export function buildTrendData(dailyData: DailyDatum[]): TrendDatum[] {
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

export function buildChartTickValues(dailyData: DailyDatum[]) {
  if (dailyData.length <= 12) return dailyData.map((day) => day.category);

  const maxTicks = dailyData.length <= 35 ? 8 : 9;
  const step = Math.max(1, Math.ceil((dailyData.length - 1) / (maxTicks - 1)));
  const ticks = dailyData
    .filter((_, index) => index === 0 || index === dailyData.length - 1 || index % step === 0)
    .map((day) => day.category);

  return Array.from(new Set(ticks));
}

export function buildHourlyData(entries: ParsedEntry[]): HourDatum[] {
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

export function getMostActiveHour(hours: HourDatum[], kind: 'smoking' | 'nicorette') {
  const sorted = [...hours].sort((left, right) => right[kind] - left[kind]);
  const hour = sorted[0];
  return hour && hour[kind] > 0 ? hour.hour : null;
}
