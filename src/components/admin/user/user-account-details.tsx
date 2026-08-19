import { UserIcon } from 'lucide-react';
import RbacUserGroupAssignment from '@/components/admin/rbac/RbacUserGroupAssignment';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import type { user } from '@/db/schema/auth';

type User = typeof user.$inferSelect;
interface UserAccountDetailsProps {
  user: User;
}

export default function UserAccountDetails({ user }: UserAccountDetailsProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium flex items-center gap-2">
            <UserIcon className="h-5 w-5 text-primary" />
            Account Details
          </h3>
          <span className={`px-2 py-1 rounded-full text-xs ${user.active ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
            {user.active ? 'Active' : 'Pending'}
          </span>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground text-sm">User ID</Label>
              <p
                className="font-mono text-sm truncate"
                title={user.id}
              >
                {user.id}
              </p>
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">Super Admin Bypass</Label>
              <p>{user.isSuperAdmin ? 'Enabled' : 'Disabled'}</p>
            </div>
          </div>

          <div>
            <Label className="text-muted-foreground text-sm">Email</Label>
            <p>{user.email}</p>
          </div>

          <div>
            <Label className="text-muted-foreground text-sm">Created</Label>
            <p>{new Date(user.createdAt).toLocaleDateString()}</p>
          </div>

          <Separator />

          <RbacUserGroupAssignment userId={user.id} />
        </div>
      </CardContent>
    </Card>
  );
}
