import type { User } from '@db/client';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { Ban, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { useConfirmation } from '@/hooks/use-confirmation';
import { formatSize } from '@/libs/utils';
import { deleteAdminUser, reactivateUser as reactivateUserFn, suspendUser as suspendUserFn } from '@/server/fns/admin/users';

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
        className="w-full"
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
          <div className="space-y-2">
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
    <Card className="border-destructive/20">
      <CardContent className="pt-6">
        <h3 className="text-lg font-medium text-destructive mb-4">Danger Zone</h3>
        <div className="space-y-4">
          <div className="p-4 border border-destructive/20 rounded-lg">
            <h4 className="font-medium flex items-center gap-2 mb-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              Delete Account
            </h4>
            <p className="text-sm text-muted-foreground mb-4">
              Permanently delete this user and all their files. This action cannot be undone.
            </p>
            <DeleteUserDialog
              user={user}
              fileCount={fileCount}
              totalSize={totalSize}
              isDeleting={isDeleting}
              onConfirm={() => deleteUser({ id: user.id })}
            />
          </div>

          <div className="p-4 border border-amber-500/20 rounded-lg">
            <h4 className="font-medium flex items-center gap-2 mb-2 text-amber-600">
              <Ban className="h-4 w-4" />
              Suspend Account
            </h4>
            <p className="text-sm text-muted-foreground mb-4">
              Temporarily suspend this account. The user will not be able to login or upload files.
            </p>
            {user.banned ? (
              <Button
                variant="outline"
                onClick={handleReactivateUser}
                size="sm"
                className="w-full border-amber-500/50 text-amber-600 hover:bg-amber-50"
              >
                Reactivate Account
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={handleSuspendUser}
                size="sm"
                className="w-full border-amber-500/50 text-amber-600 hover:bg-amber-50"
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
