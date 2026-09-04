import { UserIcon } from 'lucide-react';
import RbacUserGroupAssignment from '@/components/admin/rbac/RbacUserGroupAssignment';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import type { user } from '@/db/schema/auth';
import styles from './user-account-details.module.css';

type User = typeof user.$inferSelect;
interface UserAccountDetailsProps {
  user: User;
}

export default function UserAccountDetails({ user }: UserAccountDetailsProps) {
  return (
    <Card>
      <CardContent className={styles.body}>
        <div className={styles.header}>
          <h3 className={styles.heading}>
            <UserIcon className={styles.headingIcon} />
            Account Details
          </h3>
          <span
            className={styles.statusPill}
            data-state={user.active ? 'active' : 'pending'}
          >
            {user.active ? 'Active' : 'Pending'}
          </span>
        </div>

        <div className="stack space-4">
          <div className={styles.pair}>
            <div>
              <Label className={styles.fieldLabel}>User ID</Label>
              <p
                className={styles.userId}
                title={user.id}
              >
                {user.id}
              </p>
            </div>
            <div>
              <Label className={styles.fieldLabel}>Super Admin Bypass</Label>
              <p>{user.isSuperAdmin ? 'Enabled' : 'Disabled'}</p>
            </div>
          </div>

          <div>
            <Label className={styles.fieldLabel}>Email</Label>
            <p>{user.email}</p>
          </div>

          <div>
            <Label className={styles.fieldLabel}>Created</Label>
            <p>{new Date(user.createdAt).toLocaleDateString()}</p>
          </div>

          <Separator />

          <RbacUserGroupAssignment userId={user.id} />
        </div>
      </CardContent>
    </Card>
  );
}
