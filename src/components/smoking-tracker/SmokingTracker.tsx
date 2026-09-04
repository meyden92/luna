import { useMutation, useQueryClient } from '@tanstack/react-query';
import { differenceInCalendarDays, differenceInMinutes, eachDayOfInterval, startOfDay, subDays } from 'date-fns';
import {
  Activity,
  BarChart3,
  CalendarDays,
  Cigarette,
  Clock,
  Flame,
  Gauge,
  HeartPulse,
  LineChart as LineChartIcon,
  ListChecks,
  Pill,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import LineChart from '@/components/charting/LineChart';
import StackedBarChart from '@/components/charting/StackedBarChart';
import { Button } from '@/components/ui/button';
import { queryKeys } from '@/libs/query-keys';
import {
  type CreateNicotineEntryInput,
  createNicotineEntry,
  deleteNicotineEntry,
  type NicotineEntriesPayload,
  type NicotineKind,
  type UpdateNicotineEntryInput,
  updateNicotineEntry,
} from '@/server/fns/nicotine';
import { EntriesTable } from './EntriesTable';
import { EntryDialogs } from './EntryDialogs';
import { HourlyRhythm } from './HourlyRhythm';
import {
  asDayKey,
  average,
  buildChartTickValues,
  buildDailyData,
  buildGapMap,
  buildHourlyData,
  buildTrendData,
  CHART_COLORS,
  DAY_MS,
  type DailyDatum,
  formatChartDate,
  formatMinutes,
  formatSigned,
  getMostActiveHour,
  type Insight,
  type ParsedEntry,
  PERIOD_OPTIONS,
  type PeriodKey,
  parseEntry,
  RECOVERY_MILESTONES,
  type RecoveryMilestoneView,
  sortEntryDTOs,
  type TrendDatum,
  toDateTimeLocalValue,
} from './helpers';
import { InsightCard } from './InsightCard';
import { MetricCard } from './MetricCard';
import { QuickLogPanel } from './QuickLogPanel';
import { RecoveryPanel } from './RecoveryPanel';
import { SectionShell } from './SectionShell';
import styles from './SmokingTracker.module.css';
import { TrackerHero } from './TrackerHero';

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

  const recentEntries = parsedEntries.slice(0, 40);
  const periodLabel = PERIOD_OPTIONS.find((item) => item.value === period)?.label ?? '30 Tage';
  const chartDateFormatter = (value: string | number | Date) => formatChartDate(value, analytics.periodDays > 180);
  const showDenseChartDetails = analytics.dailyData.length <= 35;

  return (
    <div className={styles.root}>
      <TrackerHero
        lastEntry={analytics.lastEntry}
        lastSmoking={analytics.lastSmoking}
        currentSmokeFreeMs={analytics.currentSmokeFreeMs}
        currentEntryMs={analytics.currentEntryMs}
      />

      <section className={styles.captureRow}>
        <QuickLogPanel
          note={note}
          onNoteChange={setNote}
          onLogSmoking={submitSmoking}
          onLogNicorette={submitNicorette}
          isPending={isCreating}
        />

        <div className={styles.metricPair}>
          <MetricCard
            title="Heute Rauchen"
            value={String(analytics.todaySmoking)}
            detail={`${analytics.todayNicorette} Nicorette heute`}
            icon={Cigarette}
            tone="danger"
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
            tone={analytics.smokingDelta !== null && analytics.smokingDelta <= 0 ? 'success' : 'warning'}
          />
          <MetricCard
            title="Durchschnittlicher Abstand"
            value={formatMinutes(analytics.averageGapMinutes)}
            detail="Zwischen zwei Rauch-Einträgen"
            icon={Gauge}
            tone="info"
          />
          <MetricCard
            title="Rauchfreie Tage"
            value={`${analytics.smokeFreeDayRate}%`}
            detail={`${analytics.periodDays} Tage im betrachteten Zeitraum`}
            icon={CalendarDays}
            tone="success"
          />
        </div>
      </section>

      <SectionShell
        title="Kernwerte"
        description="Kompakte Orientierung für den ausgewählten Zeitraum."
        icon={Gauge}
      >
        <div className={styles.metricQuad}>
          <MetricCard
            title="Aktuelle Phase"
            value={formatMinutes(analytics.currentSmokeFreeMinutes)}
            detail="Ohne Zigarette"
            icon={Flame}
            tone="danger"
          />
          <MetricCard
            title="Beste Phase"
            value={formatMinutes(analytics.longestGapMinutes)}
            detail="Längster Abstand ohne Zigarette"
            icon={Trophy}
            tone="warning"
          />
          <MetricCard
            title="Nicorette-Anteil"
            value={`${analytics.nicotineShare}%`}
            detail={`${analytics.periodNicorette} Einträge im Zeitraum`}
            icon={HeartPulse}
            tone="success"
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
        <RecoveryPanel
          milestones={analytics.recoveryMilestones}
          reachedCount={analytics.reachedRecoveryMilestones}
          progress={analytics.recoveryProgress}
          nextMilestone={analytics.nextRecoveryMilestone}
          currentSmokeFreeMinutes={analytics.currentSmokeFreeMinutes}
        />
      </SectionShell>

      <SectionShell
        title="Analyse"
        description="Verlauf, Vergleich und gleitender 7-Tage-Schnitt."
        icon={BarChart3}
        action={
          <div className={styles.periodButtons}>
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
        <div className={styles.charts}>
          <div className={styles.chartPanel}>
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
          <div className={styles.chartPanel}>
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

      <div className={styles.splitRow}>
        <SectionShell
          title="Tagesrhythmus"
          description="Verteilung nach Uhrzeit."
          icon={LineChartIcon}
        >
          <HourlyRhythm hourlyData={analytics.hourlyData} />
        </SectionShell>

        <SectionShell
          title="Lesbare Einsichten"
          description="Aus der aktuellen Zeitreihe berechnet."
          icon={Sparkles}
        >
          <div className={styles.insightList}>
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
        <EntriesTable
          entries={recentEntries}
          entryGapById={analytics.entryGapById}
          smokingGapById={analytics.smokingGapById}
          onEdit={openEditDialog}
          onDelete={setEntryToDelete}
        />
      </SectionShell>

      <EntryDialogs
        editingEntry={editingEntry}
        editKind={editKind}
        editNote={editNote}
        editOccurredAt={editOccurredAt}
        onEditKindChange={setEditKind}
        onEditNoteChange={setEditNote}
        onEditOccurredAtChange={setEditOccurredAt}
        onCloseEdit={() => setEditingEntry(null)}
        onSubmitEdit={submitEdit}
        isUpdating={isUpdating}
        entryToDelete={entryToDelete}
        onCloseDelete={() => setEntryToDelete(null)}
        onConfirmDelete={() => {
          if (entryToDelete) removeEntry(entryToDelete.id);
        }}
        isDeleting={isDeleting}
      />
    </div>
  );
}
