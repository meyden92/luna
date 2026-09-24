import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { settingsOverviewQuery } from '@/routes/_dashboard/_settings';
import type { SettingsOverview } from '@/server/fns/dashboard/settings-overview';
import { updateTokenSettings } from '@/server/fns/user';
import { SettingsPanel, SettingsPanelHeader } from './settings-panel';
import { SettingsRow } from './settings-row';
import styles from './upload-defaults-panel.module.css';

const ROOT_FOLDER_VALUE = '__root__';

interface UploadDefaultsPanelProps {
  tokens: SettingsOverview['tokens'];
  folders: { id: string; name: string }[];
}

/**
 * "Defaults for new uploads" applies to every one of the owner's upload
 * tokens at once — the folder and metadata-scrub choice ShareX and the
 * Upload button should default to, not a setting per token. It reads its
 * current values from the first token and writes to all of them.
 */
export function UploadDefaultsPanel({ tokens, folders }: UploadDefaultsPanelProps) {
  const queryClient = useQueryClient();
  const primary = tokens[0] ?? null;
  const [isSaving, setIsSaving] = useState(false);

  const { mutateAsync: saveTokenSettings } = useAppMutation(updateTokenSettings, { errorMessage: false });

  const applyToAllTokens = async (partial: { folderId?: string | null; stripMetadata?: boolean }) => {
    setIsSaving(true);
    try {
      await Promise.all(
        tokens.map((token) =>
          saveTokenSettings({
            tokenId: token.id,
            compressImage: token.compressImage,
            convertToJpeg: token.convertToJpeg,
            jpegQuality: token.jpegQuality,
            flowId: token.flowId,
            folderId: partial.folderId !== undefined ? partial.folderId : token.folderId,
            stripMetadata: partial.stripMetadata !== undefined ? partial.stripMetadata : token.stripMetadata,
          }),
        ),
      );
      await queryClient.invalidateQueries({ queryKey: settingsOverviewQuery.queryKey });
    } catch {
      toast.error('Failed to update upload defaults');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsPanel>
      <SettingsPanelHeader
        title="Defaults for new uploads"
        description="Applies to ShareX and the Upload button."
      />
      <SettingsRow label="Folder">
        <Select
          value={primary?.folderId ?? ROOT_FOLDER_VALUE}
          onValueChange={(value) => void applyToAllTokens({ folderId: value === ROOT_FOLDER_VALUE ? null : value })}
          disabled={!primary || isSaving}
        >
          <SelectTrigger
            size="sm"
            className={styles.select}
          >
            <SelectValue placeholder="Not in a folder" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ROOT_FOLDER_VALUE}>Not in a folder</SelectItem>
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
      </SettingsRow>
      <SettingsRow
        label="Who can open links"
        hint="Not configurable yet — new uploads keep their current visibility."
      >
        <ToggleGroup
          variant="outline"
          size="sm"
          value={['public']}
          disabled
        >
          <ToggleGroupItem value="public">Anyone with the link</ToggleGroupItem>
          <ToggleGroupItem value="private">Only me</ToggleGroupItem>
        </ToggleGroup>
      </SettingsRow>
      <SettingsRow
        label="Remove photo location"
        hint="Strips GPS and camera details before saving."
      >
        <Switch
          checked={primary?.stripMetadata ?? false}
          disabled={!primary || isSaving}
          onCheckedChange={(checked) => void applyToAllTokens({ stripMetadata: Boolean(checked) })}
        />
      </SettingsRow>
      {!primary && <p className={styles.hint}>Create an upload token above to set defaults.</p>}
    </SettingsPanel>
  );
}
