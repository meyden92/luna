import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound } from '@tanstack/react-router';
import MusicPlayer from '@/components/audio/MusicPlayer';
import { queryKeys } from '@/libs/query-keys';
import { listMyAudioFiles } from '@/server/fns/dashboard/audio';
import styles from './player.module.css';

const playerQuery = queryOptions({
  queryKey: queryKeys.dashboard.playerFiles,
  queryFn: () => listMyAudioFiles(),
});

export const Route = createFileRoute('/_dashboard/player')({
  head: () => ({ meta: [{ title: 'Player | LunaShare' }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(playerQuery),
  component: PlayerPage,
});

function PlayerPage() {
  const { session } = Route.useRouteContext();
  if (!session?.user) throw notFound();

  const { data: files } = useSuspenseQuery(playerQuery);

  return (
    <div className={styles.root}>
      <MusicPlayer files={files} />
    </div>
  );
}
