import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Copy, Download, Loader2, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { useConfirmation } from '@/hooks/use-confirmation';
import { queryKeys } from '@/libs/query-keys';
import { DEFAULT_SHAREX_JPEG_QUALITY, MAX_SHAREX_JPEG_QUALITY, MIN_SHAREX_JPEG_QUALITY } from '@/libs/sharex-constants';
import { settingsOverviewQuery } from '@/routes/_dashboard/_settings';
import { listFolders } from '@/server/fns/folders';
import { createUserToken, deleteUserToken, getShareXConfig, updateTokenSettings } from '@/server/fns/user';

interface SharexSettings {
  compressImage: boolean;
  convertToJpeg: boolean;
  jpegQuality: number;
  folderId: string | null;
  stripMetadata: boolean;
  flowId: string | null;
}

type SharexConfig = Awaited<ReturnType<typeof getShareXConfig>>;
type SharexConfigAction = {
  keyId: string;
  tokenName: string;
  action: 'copy' | 'download';
};
type CreatedToken = { id: string; name: string | null; key: string; copied: boolean };
type DeleteTokenAction = { id: string };

export const Route = createFileRoute('/_dashboard/_settings/settings/api')({
  head: () => ({ meta: [{ title: 'API Settings | LunaShare' }] }),
  component: SettingsApiPage,
});

function sharexConfigFilename(tokenName: string): string {
  const safeName = tokenName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${safeName || 'sharex'}.sxcu`;
}

function downloadSharexConfig(configText: string, filename: string) {
  const url = URL.createObjectURL(new Blob([configText], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function SettingsApiPage() {
  const queryClient = useQueryClient();
  const { data: settings } = useSuspenseQuery(settingsOverviewQuery);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdToken, setCreatedToken] = useState<CreatedToken | null>(null);
  const { confirm, ConfirmationDialog } = useConfirmation<DeleteTokenAction>();
  const [sharexDraftsByKey, setSharexDraftsByKey] = useState<Record<string, Partial<SharexSettings>>>({});

  const { data: folders = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: queryKeys.folders.all,
    queryFn: async () => {
      return listFolders() as Promise<{ id: string; name: string }[]>;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Token copied to clipboard');
      return true;
    } catch {
      toast.error('Failed to copy token');
      return false;
    }
  };

  const { mutate: createKey, isPending: isCreating } = useAppMutation(createUserToken, {
    invalidates: [settingsOverviewQuery.queryKey],
    errorMessage: 'Failed to create token',
    onSuccess: (token) => {
      setIsCreateOpen(false);
      setNewKeyName('');
      setCreatedToken({ id: token.id, name: token.name, key: token.key, copied: false });
      void copyToClipboard(token.key).then((copied) => {
        setCreatedToken((current) => (current?.id === token.id ? { ...current, copied } : current));
      });
    },
  });

  const { mutate: deleteKey, isPending: isDeleting } = useAppMutation(deleteUserToken, {
    invalidates: [settingsOverviewQuery.queryKey],
    successMessage: 'Token deleted successfully',
    errorMessage: 'Failed to delete token',
    onSuccess: (_data, variables) => {
      setSharexDraftsByKey((prev) => {
        const { [variables.id]: _removed, ...rest } = prev;
        return rest;
      });
    },
  });

  const {
    mutate: createSharexConfig,
    isPending: isCreatingSharexConfig,
    variables: sharexConfigVariables,
  } = useAppMutation<SharexConfigAction, SharexConfig>(({ data }) => getShareXConfig({ data: { keyId: data.keyId } }), {
    errorMessage: 'Failed to create ShareX config',
    onSuccess: (config, variables) => {
      const configText = JSON.stringify(config, null, 2);
      if (variables.action === 'copy') {
        void navigator.clipboard
          .writeText(configText)
          .then(() => toast.success('ShareX config copied to clipboard'))
          .catch(() => toast.error('Failed to copy ShareX config'));
        return;
      }

      downloadSharexConfig(configText, sharexConfigFilename(variables.tokenName));
      toast.success('ShareX config downloaded');
    },
  });

  const { mutate: updateSettings, isPending: isUpdatingSettings } = useAppMutation(updateTokenSettings, {
    invalidates: [settingsOverviewQuery.queryKey],
    successMessage: 'ShareX upload settings updated successfully',
    errorMessage: 'Failed to update ShareX upload settings',
    onSuccess: (_data, variables) => {
      queryClient.setQueryData<typeof settings>(settingsOverviewQuery.queryKey, (current) => {
        if (!current) return current;
        return {
          ...current,
          tokens: current.tokens.map((token) =>
            token.id === variables.tokenId
              ? {
                  ...token,
                  compressImage: variables.compressImage,
                  convertToJpeg: variables.convertToJpeg,
                  jpegQuality: variables.jpegQuality,
                  folderId: variables.folderId ?? null,
                  stripMetadata: variables.stripMetadata ?? false,
                  flowId: variables.flowId ?? null,
                }
              : token,
          ),
        };
      });
      setSharexDraftsByKey((prev) => {
        const { [variables.tokenId]: _removed, ...rest } = prev;
        return rest;
      });
    },
  });

  const getSharexSettings = (token: (typeof settings.tokens)[number]): SharexSettings => ({
    compressImage: token.compressImage,
    convertToJpeg: token.convertToJpeg,
    jpegQuality: token.jpegQuality,
    folderId: token.folderId,
    stripMetadata: token.stripMetadata,
    flowId: token.flowId,
    ...sharexDraftsByKey[token.id],
  });

  const handleSharexSettingChange = (tokenId: string, partial: Partial<SharexSettings>) => {
    setSharexDraftsByKey((prev) => ({ ...prev, [tokenId]: { ...prev[tokenId], ...partial } }));
  };

  const handleSaveSharexSettings = (token: (typeof settings.tokens)[number]) => {
    const current = getSharexSettings(token);
    updateSettings({ tokenId: token.id, ...current });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-medium">Tokens</h3>
          <p className="text-sm text-muted-foreground">Manage your upload tokens for ShareX and API access.</p>
        </div>
        <Dialog
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
        >
          <DialogTrigger render={<Button />}>
            <Plus className="mr-2 h-4 w-4" /> Create Token
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Token</DialogTitle>
              <DialogDescription>Enter a name for your new token.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label
                  htmlFor="name"
                  className="text-right"
                >
                  Name
                </Label>
                <Input
                  id="name"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="col-span-3"
                  placeholder="e.g. Development Token"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => createKey({ name: newKeyName })}
                disabled={!newKeyName || isCreating}
              >
                {isCreating ? 'Creating...' : 'Create Token'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog
          open={Boolean(createdToken)}
          onOpenChange={(open) => {
            if (!open) setCreatedToken(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Token created</DialogTitle>
              <DialogDescription>
                {createdToken?.name ? `${createdToken.name} is ready.` : 'Your token is ready.'}{' '}
                {createdToken?.copied ? 'The key has been copied to your clipboard.' : 'Copy the key now to use it in ShareX.'}
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-2 py-2">
              <Input
                value={createdToken?.key ?? ''}
                readOnly
                className="min-w-0 font-mono text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => {
                  if (createdToken) void copyToClipboard(createdToken.key);
                }}
                aria-label="Copy token"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <DialogFooter>
              <Button
                type="button"
                onClick={() => setCreatedToken(null)}
              >
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <ConfirmationDialog />
      </div>
      <Separator />
      <div className="space-y-4">
        {settings.tokens.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No Tokens found</CardTitle>
              <CardDescription>You haven't created any tokens yet.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          settings.tokens.map((token) => {
            const tokenName = token.name || 'Unnamed Token';
            const isSharexConfigBusy = isCreatingSharexConfig && sharexConfigVariables?.keyId === token.id;
            const pendingSharexAction = isSharexConfigBusy ? sharexConfigVariables?.action : null;
            const sharexConfigDisabled = !token.enabled || isCreatingSharexConfig;
            const sharexSettings = getSharexSettings(token);

            return (
              <Card key={token.id}>
                <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <CardTitle>{tokenName}</CardTitle>
                    <CardDescription>Created on {new Date(token.createdAt).toLocaleDateString()}</CardDescription>
                  </div>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="self-start sm:self-auto"
                    onClick={() =>
                      confirm({
                        title: `Delete "${tokenName}"?`,
                        description:
                          'Any ShareX clients, scripts, or automations using this token will stop uploading immediately. This cannot be undone.',
                        data: { id: token.id },
                        onConfirm: ({ id }) => deleteKey({ id }),
                      })
                    }
                    disabled={isDeleting}
                    aria-label={`Delete ${tokenName}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2 pt-4">
                    <Input
                      value={token.key}
                      readOnly
                      className="min-w-0 font-mono text-sm"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => void copyToClipboard(token.key)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="mt-3 flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium">ShareX config</p>
                      <p className="text-xs text-muted-foreground">
                        {token.enabled ? 'Copy or download the .sxcu file for this token.' : 'Enable this token before creating a config.'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => createSharexConfig({ keyId: token.id, tokenName, action: 'copy' })}
                        disabled={sharexConfigDisabled}
                      >
                        {pendingSharexAction === 'copy' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                        Copy .sxcu
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => createSharexConfig({ keyId: token.id, tokenName, action: 'download' })}
                        disabled={sharexConfigDisabled}
                      >
                        {pendingSharexAction === 'download' ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        Download .sxcu
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 space-y-4 border rounded-lg p-4">
                    <div>
                      <p className="text-sm font-medium">ShareX Upload Settings</p>
                      <p className="text-xs text-muted-foreground">Configure compression and default folder behavior for this token.</p>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <Label className="text-sm">Compress images before upload</Label>
                        <p className="text-xs text-muted-foreground">Only affects image uploads sent through this key.</p>
                      </div>
                      <Switch
                        checked={sharexSettings.compressImage}
                        onCheckedChange={(checked) => handleSharexSettingChange(token.id, { compressImage: Boolean(checked) })}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <Label className="text-sm">Convert images to JPEG</Label>
                        <p className="text-xs text-muted-foreground">
                          Transparent areas are flattened to white when conversion is enabled.
                        </p>
                      </div>
                      <Switch
                        checked={sharexSettings.convertToJpeg}
                        onCheckedChange={(checked) => handleSharexSettingChange(token.id, { convertToJpeg: Boolean(checked) })}
                        disabled={!sharexSettings.compressImage}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <Label className="text-sm">Strip upload metadata</Label>
                        <p className="text-xs text-muted-foreground">
                          Remove common image metadata automatically and store a privacy report with each upload.
                        </p>
                      </div>
                      <Switch
                        checked={sharexSettings.stripMetadata}
                        onCheckedChange={(checked) => handleSharexSettingChange(token.id, { stripMetadata: Boolean(checked) })}
                      />
                    </div>

                    <div className="space-y-2 rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">JPEG quality</Label>
                        <span className="text-xs text-muted-foreground">{sharexSettings.jpegQuality}</span>
                      </div>
                      <Slider
                        value={[sharexSettings.jpegQuality]}
                        min={MIN_SHAREX_JPEG_QUALITY}
                        max={MAX_SHAREX_JPEG_QUALITY}
                        step={1}
                        onValueChange={(value) => {
                          const next = Array.isArray(value) ? value[0] : value;
                          handleSharexSettingChange(token.id, { jpegQuality: next ?? DEFAULT_SHAREX_JPEG_QUALITY });
                        }}
                        disabled={!sharexSettings.compressImage}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm">Default folder</Label>
                      <Select
                        value={sharexSettings.folderId ?? '__root__'}
                        onValueChange={(value) => handleSharexSettingChange(token.id, { folderId: value === '__root__' ? null : value })}
                      >
                        <SelectTrigger className="w-full justify-between">
                          <SelectValue placeholder="Select folder" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__root__">Root (no folder)</SelectItem>
                          {folders.map((folder) => (
                            <SelectItem
                              key={folder.id}
                              value={folder.id}
                            >
                              {folder.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleSaveSharexSettings(token)}
                      disabled={isUpdatingSettings}
                    >
                      {isUpdatingSettings ? 'Saving...' : 'Save ShareX settings'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
