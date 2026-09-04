import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Download, ExternalLink, Loader2, Save } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { BeautifierCanvas } from '@/components/beautifier/beautifier-canvas';
import { BeautifierControls } from '@/components/beautifier/beautifier-controls';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useBeautifierStore } from '@/hooks/stores/beautifier-store';
import { queryKeys } from '@/libs/query-keys';
import type { BeautifierSourceFile } from '@/schemas/beautifier-schema';
import { saveBeautifiedImage } from '@/server/fns/beautifier';
import styles from './beautifier-editor.module.css';

interface BeautifierEditorProps {
  source: BeautifierSourceFile;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Could not export canvas'));
          return;
        }
        resolve(blob);
      }, 'image/png');
    } catch (error) {
      reject(error);
    }
  });
}

function filenameFromSource(source: BeautifierSourceFile) {
  const title = source.title?.trim().replace(/\.[^.]+$/, '') || 'lunashare-image';
  return `${title}-beautified.png`;
}

export function BeautifierEditor({ source }: BeautifierEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const queryClient = useQueryClient();
  const { config, savedFile, setSource, updateConfig, resetConfig, setSaving, setSavedFile } = useBeautifierStore(
    useShallow((state) => ({
      config: state.config,
      savedFile: state.savedFile,
      setSource: state.setSource,
      updateConfig: state.updateConfig,
      resetConfig: state.resetConfig,
      setSaving: state.setSaving,
      setSavedFile: state.setSavedFile,
    })),
  );

  useEffect(() => {
    setSource(source);
  }, [source, setSource]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('Canvas is not ready');
      const imageDataUrl = canvas.toDataURL('image/png');
      return saveBeautifiedImage({
        data: {
          sourceFileId: source.id,
          title: filenameFromSource(source),
          imageDataUrl,
          config,
        },
      });
    },
    onMutate: () => {
      setSaving(true);
      setSavedFile(null);
    },
    onSuccess: (result) => {
      setSavedFile(result.file);
      queryClient.invalidateQueries({ queryKey: queryKeys.gallery.all, refetchType: 'none' });
      toast.success('Beautified image saved to your gallery.');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not save beautified image');
    },
    onSettled: () => {
      setSaving(false);
    },
  });

  const handleCanvasReady = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
  }, []);

  const handleDownload = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      toast.error('Canvas is not ready yet.');
      return;
    }

    try {
      const blob = await canvasToBlob(canvas);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filenameFromSource(source);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Beautified image downloaded.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not download image');
    }
  }, [source]);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.headerMain}>
          <Link
            to="/dashboard"
            className={styles.backLink}
          >
            <ArrowLeft className={styles.backIcon} />
            Gallery
          </Link>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>Beautify</h1>
            <span className={styles.dimensions}>
              {config.width} x {config.height} PNG
            </span>
          </div>
        </div>

        <div className="cluster space-2">
          {savedFile ? (
            <Badge
              variant="outline"
              className={styles.savedBadge}
            >
              Saved
            </Badge>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={handleDownload}
          >
            <Download className={styles.buttonIcon} />
            Download
          </Button>
          <Button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? <Loader2 className={styles.spinner} /> : <Save className={styles.buttonIcon} />}
            Save to gallery
          </Button>
          {savedFile ? (
            <Button
              type="button"
              variant="outline"
              render={
                <Link
                  to="/view/$id"
                  params={{ id: savedFile.id }}
                />
              }
            >
              <ExternalLink className={styles.buttonIcon} />
              View
            </Button>
          ) : null}
        </div>
      </header>

      <div className={styles.layout}>
        <BeautifierCanvas
          source={source}
          config={config}
          onCanvasReady={handleCanvasReady}
        />
        <BeautifierControls
          source={source}
          config={config}
          onConfigChange={(updates) => {
            updateConfig(updates);
            setSavedFile(null);
          }}
          onReset={() => {
            resetConfig();
            toast.info('Beautifier settings reset.');
          }}
        />
      </div>
    </div>
  );
}
