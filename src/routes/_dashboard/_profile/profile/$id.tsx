import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { CameraIcon, Navigation } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { queryKeys } from '@/libs/query-keys';
import { cn, getAvatarUrl } from '@/libs/utils';
import { getProfileById } from '@/server/fns/dashboard/profile';
import styles from './$id.module.css';

const profileQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.dashboard.profile(id),
    queryFn: () => getProfileById({ data: { id } }),
  });

export const Route = createFileRoute('/_dashboard/_profile/profile/$id')({
  head: () => ({ meta: [{ title: 'Profile | LunaShare' }] }),
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(profileQuery(params.id));
    if (!data) throw notFound();
    return data;
  },
  component: ProfilePage,
});

function ProfilePage() {
  const { id } = Route.useParams();
  const { data: user } = useSuspenseQuery(profileQuery(id));
  if (!user) throw notFound();

  return (
    <div className="container margin-top-8">
      <Card className={styles.card}>
        <CardContent className="pad-0">
          <div className={styles.cover} />
          <div className="pad-6">
            <div className={styles.headRow}>
              <Avatar className={styles.avatar}>
                <AvatarImage
                  src={getAvatarUrl(user.image) ?? ''}
                  alt={user.name}
                />
                <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className={styles.identity}>
                <h1 className={cn('type-3xl weight-bold', styles.name)}>{user.name}</h1>
                <p className={styles.muted}>{user.bio || 'This user has not set a bio yet.'}</p>
              </div>
            </div>

            <div className={styles.badges}>
              <Badge
                variant="secondary"
                className="type-sm"
              >
                <CameraIcon className={styles.badgeIcon} />
                {user._count.File.toLocaleString()} Uploads
              </Badge>
              <Badge
                variant="secondary"
                className="type-sm"
              >
                <Navigation className={styles.badgeIcon} />
                {user.role}
              </Badge>
            </div>

            <p className={styles.muted}>{user.description || 'This user has not set a description yet.'}</p>

            <Separator className="margin-top-3" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
