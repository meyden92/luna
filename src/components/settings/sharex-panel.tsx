import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { getShareXConfig } from '@/server/fns/user';
import { SettingsPanel, SettingsPanelHeader } from './settings-panel';
import styles from './sharex-panel.module.css';

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

interface SharexPanelProps {
  /** The token the downloaded config authenticates as — the owner's first enabled upload token, if any. */
  primaryToken: { id: string; name: string } | null;
}

/** The ShareX card: one Download button, wired to whichever upload token the config should use. */
export function SharexPanel({ primaryToken }: SharexPanelProps) {
  const { mutate: createConfig, isPending } = useAppMutation(getShareXConfig, {
    errorMessage: 'Failed to create ShareX config',
    onSuccess: (config) => {
      downloadSharexConfig(JSON.stringify(config, null, 2), sharexConfigFilename(primaryToken?.name ?? 'sharex'));
      toast.success('LunaShare.sxcu downloaded');
    },
  });

  return (
    <SettingsPanel>
      <SettingsPanelHeader
        icon={
          <img
            src="/sharex.png"
            alt=""
            className={styles.icon}
          />
        }
        title="ShareX"
        description="Download the config and double-click it. ShareX will upload straight to LunaShare."
        action={
          <Button
            size="sm"
            disabled={!primaryToken || isPending}
            onClick={() => primaryToken && createConfig({ keyId: primaryToken.id })}
          >
            <Download />
            Download config
          </Button>
        }
      />
      {!primaryToken && <p className={styles.hint}>Create an upload token below first.</p>}
    </SettingsPanel>
  );
}
