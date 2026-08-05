import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { SmokingTracker } from '@/components/smoking-tracker/SmokingTracker';
import { queryKeys } from '@/libs/query-keys';
import { listNicotineEntries } from '@/server/fns/nicotine';

const nicotineEntriesQuery = queryOptions({
  queryKey: queryKeys.nicotine.entries,
  queryFn: () => listNicotineEntries(),
});

export const Route = createFileRoute('/_dashboard/tools/rauchen')({
  head: () => ({ meta: [{ title: 'Rauchen | LunaShare' }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(nicotineEntriesQuery),
  component: SmokingTrackerRoute,
});

function SmokingTrackerRoute() {
  const { data } = useSuspenseQuery(nicotineEntriesQuery);
  return <SmokingTracker data={data} />;
}
