import { queryOptions, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { RefreshCw, Shield, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useConfirmation } from '@/hooks/use-confirmation';
import { authClient } from '@/libs/auth/auth-client';
import { queryKeys } from '@/libs/query-keys';
import { listUserSessions } from '@/server/fns/session';

type RevokeAction = { type: 'single'; token: string; isCurrentSession: boolean } | { type: 'others' } | { type: 'all' };

const sessionsQueryOptions = queryOptions({
  queryKey: queryKeys.user.sessions,
  queryFn: () => listUserSessions(),
});

export const Route = createFileRoute('/_dashboard/_settings/settings/account')({
  loader: ({ context }) => context.queryClient.ensureQueryData(sessionsQueryOptions),
  head: () => ({ meta: [{ title: 'Account | LunaShare' }] }),
  component: SettingsAccountPage,
});

function SettingsAccountPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: sessions, isFetching, refetch } = useSuspenseQuery(sessionsQueryOptions);
  const { data: currentSession } = authClient.useSession();
  const { confirm, ConfirmationDialog } = useConfirmation<RevokeAction>();
  const [pendingAction, setPendingAction] = useState<RevokeAction['type'] | null>(null);

  const currentSessionToken = currentSession?.session?.token;

  const hasOtherSessions = useMemo(() => {
    if (!currentSessionToken) return sessions.length > 1;
    return sessions.some((session) => session.token !== currentSessionToken);
  }, [sessions, currentSessionToken]);

  const invalidateSessions = useCallback(() => queryClient.invalidateQueries({ queryKey: queryKeys.user.sessions }), [queryClient]);

  const forceLogoutAndRedirect = useCallback(async () => {
    try {
      await authClient.signOut();
    } catch {
      /* already revoked */
    } finally {
      navigate({ to: '/login' });
    }
  }, [navigate]);

  const handleConfirmedRevoke = useCallback(
    async (action: RevokeAction) => {
      setPendingAction(action.type);

      if (action.type === 'single') {
        const result = await authClient.revokeSession({ token: action.token });
        if (result.error) {
          toast.error('Failed to revoke session');
          setPendingAction(null);
          return;
        }
        toast.success('Session revoked');
        if (action.isCurrentSession) {
          await forceLogoutAndRedirect();
          return;
        }
        await invalidateSessions();
        setPendingAction(null);
        return;
      }

      if (action.type === 'others') {
        const result = await authClient.revokeOtherSessions();
        if (result.error) {
          toast.error('Failed to revoke other sessions');
          setPendingAction(null);
          return;
        }
        toast.success('Other sessions revoked');
        await invalidateSessions();
        setPendingAction(null);
        return;
      }

      const result = await authClient.revokeSessions();
      if (result.error) {
        toast.error('Failed to revoke all sessions');
        setPendingAction(null);
        return;
      }
      toast.success('All sessions revoked');
      await forceLogoutAndRedirect();
    },
    [forceLogoutAndRedirect, invalidateSessions],
  );

  const confirmRevoke = useCallback(
    (action: RevokeAction) => {
      const copy =
        action.type === 'single'
          ? {
              title: 'Revoke this session?',
              description: action.isCurrentSession
                ? 'This is your current session. You will be logged out immediately.'
                : 'This will sign out that device.',
            }
          : action.type === 'others'
            ? {
                title: 'Revoke other sessions?',
                description: 'This will sign out all other devices and keep your current session active.',
              }
            : {
                title: 'Revoke all sessions?',
                description: 'This will sign you out of all devices, including this one.',
              };

      confirm({
        title: copy.title,
        description: copy.description,
        data: action,
        onConfirm: handleConfirmedRevoke,
      });
    },
    [confirm, handleConfirmedRevoke],
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Account</h3>
        <p className="text-sm text-muted-foreground">Manage your active sessions and sign out devices you no longer use.</p>
      </div>
      <Separator />

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Active Sessions
              </CardTitle>
              <CardDescription>Review where your account is signed in and revoke sessions when needed.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => void refetch()}
                disabled={isFetching || pendingAction !== null}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant="outline"
                onClick={() => confirmRevoke({ type: 'others' })}
                disabled={!hasOtherSessions || pendingAction !== null}
              >
                Revoke Other Sessions
              </Button>
              <Button
                variant="destructive"
                onClick={() => confirmRevoke({ type: 'all' })}
                disabled={sessions.length === 0 || pendingAction !== null}
              >
                Revoke All Sessions
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <div className="flex min-h-[160px] items-center justify-center text-sm text-muted-foreground">No active sessions found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Last Active</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => {
                  const isCurrentSession = session.token === currentSessionToken;
                  const isExpired = new Date(session.expiresAt) < new Date();

                  return (
                    <TableRow key={session.id}>
                      <TableCell className="max-w-[340px] truncate">{session.userAgent || 'Unknown device'}</TableCell>
                      <TableCell>{session.ipAddress || '-'}</TableCell>
                      <TableCell>{new Date(session.updatedAt).toLocaleString()}</TableCell>
                      <TableCell>{new Date(session.expiresAt).toLocaleString()}</TableCell>
                      <TableCell>
                        {isCurrentSession ? (
                          <span className="text-xs font-medium text-green-600">Current</span>
                        ) : isExpired ? (
                          <span className="text-xs font-medium text-amber-600">Expired</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Active</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pendingAction !== null}
                          onClick={() =>
                            confirmRevoke({
                              type: 'single',
                              token: session.token,
                              isCurrentSession,
                            })
                          }
                        >
                          <Trash2 className="mr-2 h-4 w-4 text-red-500" />
                          Revoke
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ConfirmationDialog />
    </div>
  );
}
