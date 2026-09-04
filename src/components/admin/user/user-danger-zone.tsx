import { useNavigate, useRouter } from '@tanstack/react-router';
import { Ban, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { user } from '@/db/schema/auth';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { useConfirmation } from '@/hooks/use-confirmation';
import { formatSize } from '@/libs/utils';
import { deleteAdminUser, reactivateUser as reactivateUserFn, suspendUser as suspendUserFn } from '@/server/fns/admin/users';
import styles from './user-danger-zone.module.css';

type User = typeof user.$inferSelect;
interface UserDangerZoneProps {
  user: User;
  fileCount: number;
  totalSize: number;
}

function DeleteUserDialog({
  user,
  fileCount,
  totalSize,
  isDeleting,
  onConfirm,
}: {
  user: User;
  fileCount: number;
  totalSize: number;
  isDeleting: boolean;
  onConfirm: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const canDelete = confirmation.trim() === user.email;

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) setConfirmation('');
  };

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        className={styles.actionButton}
        onClick={() => setIsOpen(true)}
      >
        Delete User Account
      </Button>
      <Dialog
        open={isOpen}
        onOpenChange={handleOpenChange}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {user.email}</DialogTitle>
            <DialogDescription>
              This permanently deletes <strong>{user.email}</strong> and all{' '}
              <strong>
                {fileCount} {fileCount === 1 ? 'file' : 'files'} ({formatSize(totalSize)})
              </strong>{' '}
              from storage. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="stack space-2">
            <Label htmlFor="delete-user-confirmation">Type {user.email} to confirm.</Label>
            <Input
              id="delete-user-confirmation"
              value={confirmation}
              autoComplete="off"
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onConfirm}
              disabled={!canDelete || isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function UserDangerZone({ user, fileCount, totalSize }: UserDangerZoneProps) {
  const router = useRouter();
  const navigate = useNavigate();

  const { confirm: suspendConfirm, ConfirmationDialog: SuspendConfirmationDialog } = useConfirmation<string>();
  const { confirm: reactivateConfirm, ConfirmationDialog: ReactivateConfirmationDialog } = useConfirmation<string>();

  const { mutate: suspendUser } = useAppMutation(suspendUserFn, {
    errorMessage: false,
    onError: (error) => {
      toast.error(error.message, { richColors: true });
    },
    onSuccess: () => {
      router.invalidate();
      toast.success('User suspended successfully', { richColors: true });
    },
  });

  const { mutate: reactivateUser } = useAppMutation(reactivateUserFn, {
    errorMessage: false,
    onError: (error) => {
      toast.error(error.message, { richColors: true });
    },
    onSuccess: () => {
      router.invalidate();
      toast.success('User reactivated successfully', { richColors: true });
    },
  });

  const { mutate: deleteUser, isPending: isDeleting } = useAppMutation(deleteAdminUser, {
    errorMessage: false,
    onSuccess: () => {
      navigate({ to: '/admin/users' });
    },
    onError: (error) => {
      toast.error(error.message, { richColors: true });
    },
  });

  const handleSuspendUser = () => {
    suspendConfirm({
      title: 'Suspend User',
      description: 'Are you sure you want to suspend this user?',
      data: user.id,
      onConfirm: (data) => {
        suspendUser({ id: data });
      },
    });
  };

  const handleReactivateUser = () => {
    reactivateConfirm({
      title: 'Reactivate User',
      description: 'Are you sure you want to reactivate this user?',
      data: user.id,
      onConfirm: (data) => {
        reactivateUser({ id: data });
      },
    });
  };

  return (
    <Card className={styles.card}>
      <CardContent className={styles.body}>
        <h3 className={styles.heading}>Danger Zone</h3>
        <div className="stack space-4">
          <div
            className={styles.action}
            data-tone="delete"
          >
            <h4 className={styles.actionTitle}>
              <Trash2 className={styles.actionIcon} />
              Delete Account
            </h4>
            <p className={styles.actionText}>Permanently delete this user and all their files. This action cannot be undone.</p>
            <DeleteUserDialog
              user={user}
              fileCount={fileCount}
              totalSize={totalSize}
              isDeleting={isDeleting}
              onConfirm={() => deleteUser({ id: user.id })}
            />
          </div>

          <div
            className={styles.action}
            data-tone="suspend"
          >
            <h4 className={styles.actionTitle}>
              <Ban className={styles.actionIcon} />
              Suspend Account
            </h4>
            <p className={styles.actionText}>Temporarily suspend this account. The user will not be able to login or upload files.</p>
            {user.banned ? (
              <Button
                variant="outline"
                onClick={handleReactivateUser}
                size="sm"
                className={styles.suspendButton}
              >
                Reactivate Account
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={handleSuspendUser}
                size="sm"
                className={styles.suspendButton}
              >
                Suspend Account
              </Button>
            )}
          </div>
        </div>
      </CardContent>
      <SuspendConfirmationDialog />
      <ReactivateConfirmationDialog />
    </Card>
  );
}
