import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { studioSections } from '@/components/admin/admin-destinations';
import { DestinationTiles } from '@/components/admin/destination-tiles';
import { studioHubStatsQueryOptions } from '@/components/admin/studio/queries';
import { countOf, formatUsd } from '@/libs/studio/format';
import styles from '../index.module.css';

export const Route = createFileRoute('/_admin/admin/studio/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(studioHubStatsQueryOptions),
  head: () => ({ meta: [{ title: 'Studio | LunaShare' }] }),
  component: StudioIndexPage,
});

function withInactive(noun: string, { total, inactive }: { total: number; inactive: number }) {
  return inactive > 0 ? `${countOf(total, noun)}, ${inactive} inactive` : countOf(total, noun);
}

function StudioIndexPage() {
  const { data } = useSuspenseQuery(studioHubStatsQueryOptions);
  const stats: Record<(typeof studioSections)[number]['name'], string> = {
    Categories: data.categories === 1 ? '1 Category' : `${data.categories} Categories`,
    Models: withInactive('Model', data.models),
    Templates: withInactive('Template', data.templates),
    Overview: `${formatUsd(data.monthSpendUsd)} this month, ${data.running} running`,
  };
  return (
    <div>
      <h1 className={styles.title}>Studio</h1>
      <DestinationTiles destinations={studioSections.map((section) => ({ ...section, stat: stats[section.name] }))} />
    </div>
  );
}
