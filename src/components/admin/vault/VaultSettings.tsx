import { useSuspenseQuery } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { queryKeys } from '@/libs/query-keys';
import { VAULT_ENTRIES, VAULT_GROUPS, type VaultName, vaultValueProblem } from '@/libs/vault/registry';
import type { VaultEntryState, VaultSource } from '@/libs/vault/vault';
import { removeVaultEntry, saveVaultEntry } from '@/server/fns/admin/vault';
import { vaultQueryOptions } from './queries';
import styles from './VaultSettings.module.css';

const SOURCE_BADGES: Record<VaultSource, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  env: { label: 'From environment', variant: 'secondary' },
  vault: { label: 'In Vault', variant: 'default' },
  default: { label: 'Default', variant: 'outline' },
  unset: { label: 'Not set', variant: 'outline' },
};

type Action = { kind: 'set' | 'clear'; name: VaultName; fromEnv: boolean };

/** The Vault's entries by group; values are set and cleared in a dialog that asks for the admin's password. */
export function VaultSettings() {
  const { data: entries } = useSuspenseQuery(vaultQueryOptions);
  const [action, setAction] = useState<Action | null>(null);

  return (
    <div className="stack space-6">
      <div>
        <h1 className="cluster space-2 type-2xl weight-bold">
          <KeyRound className={styles.titleIcon} />
          Vault
        </h1>
        <p className={styles.muted}>
          Deployment settings and secrets, stored encrypted with the instance&apos;s <code>FORM_FIELD_ENCRYPTION_KEY</code>. A change
          applies at once. Secrets are never shown again once saved. A value set in the environment takes precedence over the Vault.
        </p>
      </div>

      {VAULT_GROUPS.map(({ group, title }) => (
        <Card key={group}>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className={styles.list}>
              {entries
                .filter((entry) => VAULT_ENTRIES[entry.name].group === group)
                .map((entry) => (
                  <VaultEntryRow
                    key={entry.name}
                    entry={entry}
                    onAction={setAction}
                  />
                ))}
            </ul>
          </CardContent>
        </Card>
      ))}

      {action?.kind === 'set' && (
        <SetEntryDialog
          name={action.name}
          fromEnv={action.fromEnv}
          onClose={() => setAction(null)}
        />
      )}
      {action?.kind === 'clear' && (
        <ClearEntryDialog
          name={action.name}
          onClose={() => setAction(null)}
        />
      )}
    </div>
  );
}

function VaultEntryRow({ entry, onAction }: { entry: VaultEntryState; onAction: (action: Action) => void }) {
  const definition = VAULT_ENTRIES[entry.name];
  const badge = SOURCE_BADGES[entry.source];
  const fromEnv = entry.source === 'env';

  return (
    <li
      className={styles.row}
      data-testid={`vault-entry-${entry.name}`}
    >
      <div className="stack space-1">
        <div className="cluster space-2">
          <span className="weight-medium">{definition.label}</span>
          <code className={styles.name}>{entry.name}</code>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
        <p className={styles.muted}>{definition.description}</p>
        {entry.value !== undefined && <p className={styles.value}>{entry.value}</p>}
        {fromEnv && entry.stored && <p className={styles.muted}>A value is also stored in the Vault; the environment overrides it.</p>}
        {entry.storedAt && <p className={styles.muted}>Stored {new Date(entry.storedAt).toLocaleString()}</p>}
        {entry.problem && <p className={styles.problem}>{entry.problem}</p>}
      </div>
      <div className={styles.actions}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onAction({ kind: 'set', name: entry.name, fromEnv })}
        >
          {entry.stored ? 'Replace' : 'Set'}
        </Button>
        {entry.stored && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onAction({ kind: 'clear', name: entry.name, fromEnv })}
          >
            Clear
          </Button>
        )}
      </div>
    </li>
  );
}

function PasswordField({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  return (
    <div className="stack space-2">
      <Label htmlFor="vault-password">Your password</Label>
      <Input
        id="vault-password"
        type="password"
        autoComplete="current-password"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
    </div>
  );
}

function SetEntryDialog({ name, fromEnv, onClose }: { name: VaultName; fromEnv: boolean; onClose: () => void }) {
  const definition = VAULT_ENTRIES[name];
  const [value, setValue] = useState('');
  const [password, setPassword] = useState('');
  const problem = value.trim() ? vaultValueProblem(name, value.trim()) : null;

  const save = useAppMutation(saveVaultEntry, {
    successMessage: `${definition.label} saved`,
    invalidates: [queryKeys.admin.vault, queryKeys.admin.storageStatus],
    onSuccess: onClose,
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save.mutate({ name, value: value.trim(), password });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{definition.label}</DialogTitle>
          <DialogDescription>{definition.description}</DialogDescription>
        </DialogHeader>
        <form
          className="stack space-4"
          onSubmit={onSubmit}
        >
          {fromEnv && (
            <p className={styles.muted}>
              The environment sets this entry and keeps winning. The value you store here takes effect once you remove it from the
              environment.
            </p>
          )}
          <div className="stack space-2">
            <Label htmlFor="vault-value">{definition.secret ? 'New value' : 'Value'}</Label>
            <Input
              id="vault-value"
              type={definition.secret ? 'password' : 'text'}
              autoComplete="off"
              spellCheck={false}
              className={styles.input}
              required
              value={value}
              onChange={(event) => setValue(event.target.value)}
              aria-invalid={problem ? true : undefined}
              disabled={save.isPending}
            />
            {problem && <p className={styles.problem}>{problem}</p>}
          </div>
          <PasswordField
            value={password}
            onChange={setPassword}
            disabled={save.isPending}
          />
          <DialogFooter>
            <Button
              type="submit"
              disabled={save.isPending || !value.trim() || !password || problem !== null}
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ClearEntryDialog({ name, onClose }: { name: VaultName; onClose: () => void }) {
  const definition = VAULT_ENTRIES[name];
  const [password, setPassword] = useState('');

  const clear = useAppMutation(removeVaultEntry, {
    successMessage: `${definition.label} cleared`,
    invalidates: [queryKeys.admin.vault, queryKeys.admin.storageStatus],
    onSuccess: onClose,
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clear.mutate({ name, password });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clear {definition.label}?</DialogTitle>
          <DialogDescription>
            The stored value is deleted. The environment value or the default applies from then on, if there is one.
          </DialogDescription>
        </DialogHeader>
        <form
          className="stack space-4"
          onSubmit={onSubmit}
        >
          <PasswordField
            value={password}
            onChange={setPassword}
            disabled={clear.isPending}
          />
          <DialogFooter>
            <Button
              type="submit"
              variant="destructive"
              disabled={clear.isPending || !password}
            >
              Clear
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
