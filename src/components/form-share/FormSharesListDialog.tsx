import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock, Copy, Eye, Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { queryKeys } from '@/libs/query-keys';
import { deleteFormShare, listFormShares } from '@/server/fns/form-shares';
import styles from './FormSharesListDialog.module.css';

const SHARE_STATUS_LABEL: Record<'active' | 'expired' | 'pending', string> = {
  active: 'Active',
  expired: 'Expired',
  pending: 'Pending',
};

type FormShareItem = {
  id: string;
  title: string | null;
  expiresAt: Date | null;
  expiresInMs: number | null;
  maxViews: number | null;
  viewCount: number;
  createdAt: Date;
  _count: { fields: number };
};

function getShareStatus(share: FormShareItem): 'active' | 'expired' | 'pending' {
  if (share.maxViews && share.viewCount >= share.maxViews) return 'expired';
  if (share.expiresAt && share.expiresAt < new Date()) return 'expired';
  if (share.expiresInMs && !share.expiresAt && share.viewCount === 0) return 'pending';
  return 'active';
}

function ShareRow({ share, onDeleted }: { share: FormShareItem; onDeleted: () => void }) {
  const [copied, setCopied] = useState(false);

  const { mutate: executeDelete, isPending: isDeleting } = useAppMutation(deleteFormShare, {
    successMessage: 'Form share deleted.',
    errorMessage: 'Failed to delete form share.',
    onSuccess: () => onDeleted(),
  });

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/form/${share.id}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const status = getShareStatus(share);

  return (
    <div className={styles.row}>
      <div className={styles.rowMain}>
        <div className={styles.titleRow}>
          <span className={styles.title}>{share.title || 'Untitled'}</span>
          <span
            className={styles.status}
            data-status={status}
          >
            {SHARE_STATUS_LABEL[status]}
          </span>
        </div>
        <div className={styles.rowMeta}>
          <span>{`${share._count.fields} fields`}</span>
          <span className={styles.metaItem}>
            <Eye />
            {share.maxViews ? `${share.viewCount} / ${share.maxViews}` : share.viewCount}
          </span>
          {share.expiresInMs && (
            <span className={styles.metaItem}>
              <Clock />
              {status === 'pending' ? 'Starts on first view' : share.expiresAt ? share.expiresAt.toLocaleString() : null}
            </span>
          )}
        </div>
      </div>

      <div className={styles.rowActions}>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleCopyLink}
          title="Copy link"
        >
          {copied ? <Check className={styles.copiedIcon} /> : <Copy />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => executeDelete({ id: share.id })}
          disabled={isDeleting}
          title="Delete"
        >
          {isDeleting ? <Loader2 className={styles.spinner} /> : <Trash2 />}
        </Button>
      </div>
    </div>
  );
}

export function FormSharesListDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.formShares.all,
    queryFn: async () => {
      return listFormShares() as Promise<FormShareItem[]>;
    },
    enabled: open,
  });

  const shares = data ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>My Form Shares</DialogTitle>
          <DialogDescription>View and manage your shared form data.</DialogDescription>
        </DialogHeader>

        <div className={styles.list}>
          {isLoading ? (
            <div className={styles.loading}>
              <Loader2 className={`${styles.spinner} ${styles.listSpinner}`} />
            </div>
          ) : shares.length === 0 ? (
            <p className={styles.emptyText}>No form shares yet.</p>
          ) : (
            shares.map((share) => (
              <ShareRow
                key={share.id}
                share={share}
                onDeleted={() => queryClient.invalidateQueries({ queryKey: queryKeys.formShares.all })}
              />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
