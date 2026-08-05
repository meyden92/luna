import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { CameraIcon, Navigation } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { queryKeys } from '@/libs/query-keys';
import { getProfileById } from '@/server/fns/dashboard/profile';

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
    <div className="container mx-auto pt-8">
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="bg-linear-to-r from-green-400 to-green-900 h-32 sm:h-48" />
          <div className="p-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-end -mt-16 sm:-mt-24 mb-4 sm:mb-6">
              <div>
                <Avatar className="w-24 h-24 sm:w-32 sm:h-32 border-4 border-white">
                  <AvatarImage
                    src={user.image || ''}
                    alt={user.name}
                  />
                  <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                </Avatar>
              </div>
              <div className="mt-4 sm:mt-0 sm:ml-6 text-center sm:text-left">
                <h1 className="text-2xl sm:text-3xl font-bold">{user.name}</h1>
                <p className="text-muted-foreground">{user.bio || 'This user has not set a bio yet.'}</p>
              </div>
            </div>

            <div className="flex flex-wrap justify-center sm:justify-start gap-4 mb-6">
              <Badge
                variant="secondary"
                className="text-sm"
              >
                <CameraIcon className="w-4 h-4 mr-1" />
                {user._count.File.toLocaleString()} Uploads
              </Badge>
              <Badge
                variant="secondary"
                className="text-sm"
              >
                <Navigation className="w-4 h-4 mr-1" />
                {user.role}
              </Badge>
            </div>

            <p className="text-muted-foreground">{user.description || 'This user has not set a description yet.'}</p>

            <Separator className="my-3" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
