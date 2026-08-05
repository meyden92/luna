import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock, Copy, Eye, Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { queryKeys } from '@/libs/query-keys';
import { deleteFormShare, listFormShares } from '@/server/fns/form-shares';

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
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{share.title || 'Untitled'}</span>
          <span
            className={`text-xs px-1.5 py-0.5 rounded-full ${
              status === 'expired'
                ? 'bg-destructive/10 text-destructive'
                : status === 'pending'
                  ? 'bg-yellow-500/10 text-yellow-600'
                  : 'bg-green-500/10 text-green-600'
            }`}
          >
            {SHARE_STATUS_LABEL[status]}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
          <span>{`${share._count.fields} fields`}</span>
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3" />
            {share.maxViews ? `${share.viewCount} / ${share.maxViews}` : share.viewCount}
          </span>
          {share.expiresInMs && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {status === 'pending' ? 'Starts on first view' : share.expiresAt ? share.expiresAt.toLocaleString() : null}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleCopyLink}
          title="Copy link"
        >
          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => executeDelete({ id: share.id })}
          disabled={isDeleting}
          title="Delete"
        >
          {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
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

        <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : shares.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No form shares yet.</p>
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
