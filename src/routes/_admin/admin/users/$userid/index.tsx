import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { Files } from 'lucide-react';
import { ResetPasswordDialog } from '@/components/admin/user/reset-password-dialog';
import UserAccountDetails from '@/components/admin/user/user-account-details';
import UserDangerZone from '@/components/admin/user/user-danger-zone';
import UserHeader from '@/components/admin/user/user-header';
import UserStorageInfo from '@/components/admin/user/user-storage-info';
import { buttonVariants } from '@/components/ui/button';
import { queryKeys } from '@/libs/query-keys';
import { storageQuotaMiBToBytes } from '@/libs/storage-quota';
import { getAdminUserDetail } from '@/server/fns/admin/users';

const userDetailQueryOptions = (userid: string) =>
  queryOptions({
    queryKey: queryKeys.admin.user(userid),
    queryFn: () => getAdminUserDetail({ data: { id: userid } }),
  });

export const Route = createFileRoute('/_admin/admin/users/$userid/')({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(userDetailQueryOptions(params.userid));
    } catch {
      throw notFound();
    }
  },
  head: () => ({ meta: [{ title: 'User | LunaShare' }] }),
  component: UserDetailPage,
});

function UserDetailPage() {
  const { userid } = Route.useParams();
  const { data: user } = useSuspenseQuery(userDetailQueryOptions(userid));

  const totalSize = user.totalSize;
  const quotaBytes = storageQuotaMiBToBytes(user.storageQuotaMiB);
  const percentageUsed =
    quotaBytes > 0 ? Math.round((Math.min(totalSize, quotaBytes) / quotaBytes) * 100 * 100) / 100 : totalSize > 0 ? 100 : 0;

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="space-y-3">
        <UserHeader user={user} />

        <div className="flex gap-2">
          <Link
            to="/admin/users/$userid/files"
            params={{ userid: user.id }}
            className={buttonVariants({ variant: 'secondary' })}
          >
            <Files className="h-4 w-4 mr-2" />
            View Files ({user.fileCount})
          </Link>

          <ResetPasswordDialog
            userId={user.id}
            userName={user.name}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2 space-y-3">
            <UserAccountDetails user={user} />
          </div>

          <div className="space-y-3">
            <UserStorageInfo
              userId={user.id}
              totalSize={totalSize}
              quotaBytes={quotaBytes}
              storageQuotaMiB={user.storageQuotaMiB}
              percentageUsed={percentageUsed}
              fileCount={user.fileCount}
            />
            <UserDangerZone
              user={user}
              fileCount={user.fileCount}
              totalSize={totalSize}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
