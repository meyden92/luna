import { Copy, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { settingsOverviewQuery } from '@/routes/_dashboard/_settings';
import { createUserToken, deleteUserToken } from '@/server/fns/user';
import { SettingsPanel, SettingsPanelHeader } from './settings-panel';
import styles from './upload-tokens-panel.module.css';

export interface UploadToken {
  id: string;
  name: string;
  createdAt: Date;
}

interface UploadTokensPanelProps {
  tokens: UploadToken[];
}

/** The "step 2" state: a token was just created and its raw key is shown once. */
interface RevealState {
  name: string;
  key: string;
}

/**
 * Upload tokens: the table plus the two-step "+ New token" flow. The freshly
 * created key is only ever held in this component's own state (`reveal`), so
 * closing the reveal dialog is the only way it disappears — it is never
 * fetched again afterwards.
 */
export function UploadTokensPanel({ tokens }: UploadTokensPanelProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [reveal, setReveal] = useState<RevealState | null>(null);

  const { mutate: createToken, isPending: isCreating } = useAppMutation(createUserToken, {
    invalidates: [settingsOverviewQuery.queryKey],
    errorMessage: 'Failed to create token',
    onSuccess: (token) => {
      setIsCreateOpen(false);
      setName('');
      setReveal({ name: token.name || 'Untitled token', key: token.key });
    },
  });

  const { mutate: revokeToken } = useAppMutation(deleteUserToken, {
    invalidates: [settingsOverviewQuery.queryKey],
    successMessage: 'Token revoked',
    errorMessage: 'Failed to revoke token',
  });

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Token copied');
    } catch {
      toast.error('Failed to copy token');
    }
  };

  return (
    <SettingsPanel>
      <SettingsPanelHeader
        title="Upload tokens"
        description="Each token lets one app upload as you. Revoke it if a device is lost."
        action={
          <Dialog
            open={isCreateOpen}
            onOpenChange={(open) => {
              setIsCreateOpen(open);
              if (open) setName('');
            }}
          >
            <DialogTrigger
              render={
                <Button
                  size="sm"
                  variant="outline"
                />
              }
            >
              <Plus />
              New token
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New upload token</DialogTitle>
                <DialogDescription>Give it a name so you know which device uses it.</DialogDescription>
              </DialogHeader>
              <div className="stack space-2">
                <Label htmlFor="new-token-name">Name</Label>
                <Input
                  id="new-token-name"
                  autoFocus
                  placeholder="e.g. ShareX – Work PC"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && name && createToken({ name })}
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsCreateOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  disabled={!name || isCreating}
                  onClick={() => createToken({ name })}
                >
                  Create token
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      {tokens.length === 0 ? (
        <p className={styles.empty}>No upload tokens yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tokens.map((token) => (
              <TableRow key={token.id}>
                <TableCell className={styles.nameCell}>{token.name}</TableCell>
                <TableCell>{new Date(token.createdAt).toLocaleDateString()}</TableCell>
                {/* No usage timestamp is recorded for tokens yet. */}
                <TableCell className={styles.muted}>Not tracked</TableCell>
                <TableCell className={styles.actionsCell}>
                  <Button
                    size="xs"
                    variant="ghost"
                    className={styles.revoke}
                    onClick={() => {
                      revokeToken({ id: token.id });
                    }}
                  >
                    Revoke
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog
        open={!!reveal}
        onOpenChange={(open) => {
          if (!open) setReveal(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your token now</DialogTitle>
            <DialogDescription>You won’t be able to see it again after closing this.</DialogDescription>
          </DialogHeader>
          {reveal && (
            <div className={styles.tokenBox}>
              <span className={styles.tokenValue}>{reveal.key}</span>
              <Button
                size="xs"
                variant="outline"
                onClick={() => void copyToClipboard(reveal.key)}
              >
                <Copy />
                Copy
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setReveal(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsPanel>
  );
}
