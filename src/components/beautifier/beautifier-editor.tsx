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
    <div className="pb-10 pl-1 pr-1 xl:pr-10">
      <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <Link
            to="/dashboard"
            className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-luna-ink-3 transition-colors hover:text-luna-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Gallery
          </Link>
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="m-0 font-serif text-[44px] font-normal leading-none tracking-[-0.01em] text-luna-ink">Beautify</h1>
            <span className="font-mono text-xs text-luna-ink-4">
              {config.width} x {config.height} PNG
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {savedFile ? (
            <Badge
              variant="outline"
              className="h-8 border-luna-accent/40 bg-luna-accent-soft text-luna-accent-2"
            >
              Saved
            </Badge>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={handleDownload}
          >
            <Download className="h-4 w-4" />
            Download
          </Button>
          <Button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
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
              <ExternalLink className="h-4 w-4" />
              View
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
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
