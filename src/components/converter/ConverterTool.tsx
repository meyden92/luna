import { AlertTriangleIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { convertVideoToAudio, isCrossOriginIsolated, terminateVideoConverter } from '@/libs/converter/video-converter';
import type { AudioFormat, ConversionPhase, ConversionStats, QualityPreset } from '@/types/converter';
import { ConversionProgress } from './ConversionProgress';
import { ConversionResult } from './ConversionResult';
import { ConversionSettings } from './ConversionSettings';
import { FileUploadZone } from './FileUploadZone';

export function ConverterTool() {
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<ConversionPhase>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileFormat, setFileFormat] = useState<string>('');
  const [selectedFormat, setSelectedFormat] = useState<AudioFormat>('mp3');
  const [selectedPreset, setSelectedPreset] = useState<QualityPreset>('balanced');
  const [progress, setProgress] = useState(0);
  const [conversionStatus, setConversionStatus] = useState<'loading' | 'converting' | 'finalizing' | 'cancelling'>('loading');
  const [convertedBlob, setConvertedBlob] = useState<Blob | null>(null);
  const [stats, setStats] = useState<ConversionStats | null>(null);
  // Read inside the async onProgress callback, which would otherwise close over a stale state value.
  const shouldCancelRef = useRef(false);
  const runningRef = useRef(false);
  const jobIdRef = useRef(0);

  useEffect(() => {
    setIsSupported(isCrossOriginIsolated());
  }, []);

  const handleFileSelect = (file: File, format: string) => {
    setSelectedFile(file);
    setFileFormat(format);
    setPhase('file-selected');
  };

  const handleConvert = async () => {
    if (!selectedFile || runningRef.current) return;

    runningRef.current = true;
    const jobId = jobIdRef.current + 1;
    jobIdRef.current = jobId;
    const isCurrentJob = () => jobIdRef.current === jobId;
    setPhase('converting');
    setProgress(0);
    shouldCancelRef.current = false;
    const originalSize = selectedFile.size;

    try {
      setConversionStatus('loading');

      const blob = await convertVideoToAudio({
        inputFile: selectedFile,
        outputFormat: selectedFormat,
        preset: selectedPreset,
        onProgress: (percentage) => {
          if (!shouldCancelRef.current && isCurrentJob()) {
            setProgress(percentage);
            if (percentage === 100) {
              setConversionStatus('finalizing');
            } else if (percentage > 10) {
              setConversionStatus('converting');
            }
          }
        },
      });

      if (!shouldCancelRef.current && isCurrentJob()) {
        setConvertedBlob(blob);
        setStats({
          originalSize,
          convertedSize: blob.size,
          originalFormat: fileFormat.toUpperCase(),
          convertedFormat: selectedFormat,
        });
        setPhase('complete');
        toast.success('Conversion complete!');
      }
    } catch (error) {
      if (shouldCancelRef.current || !isCurrentJob()) return;
      const message = error instanceof Error ? error.message : 'Conversion failed. The video file may be corrupted.';
      toast.error(message);
      setPhase('error');
    } finally {
      if (isCurrentJob()) {
        runningRef.current = false;
        if (shouldCancelRef.current) {
          setPhase('idle');
          setSelectedFile(null);
          setProgress(0);
          setConvertedBlob(null);
          setStats(null);
          shouldCancelRef.current = false;
        }
      }
    }
  };

  const handleCancel = () => {
    if (!runningRef.current) return;
    shouldCancelRef.current = true;
    setConversionStatus('cancelling');
    setPhase('cancelling');
    terminateVideoConverter();
  };

  const handleReset = () => {
    if (runningRef.current) {
      handleCancel();
      return;
    }
    setPhase('idle');
    setSelectedFile(null);
    setProgress(0);
    setConvertedBlob(null);
    setStats(null);
    shouldCancelRef.current = false;
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="max-w-2xl mx-auto">
        <Card className="border-none shadow-lg">
          <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5">
            <CardTitle className="text-2xl">Video to Audio Converter</CardTitle>
            <CardDescription>Convert video files to audio format entirely in your browser</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {isSupported === null ? (
              <div className="rounded-lg border border-border bg-muted/20 p-6 text-center">
                <p className="text-sm text-muted-foreground">Checking browser support...</p>
              </div>
            ) : !isSupported ? (
              <div className="space-y-4 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10">
                  <AlertTriangleIcon className="size-6 text-destructive" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">In-browser conversion is not available here</p>
                  <p className="text-sm text-muted-foreground">
                    This tool needs a cross-origin-isolated page so FFmpeg can use SharedArrayBuffer. Open the converter over HTTPS with the
                    required COOP and COEP headers enabled, then reload this page.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {phase === 'idle' && (
                  <FileUploadZone
                    onFileSelect={handleFileSelect}
                    isLoading={false}
                  />
                )}

                {phase === 'file-selected' && selectedFile && (
                  <ConversionSettings
                    file={selectedFile}
                    fileFormat={fileFormat}
                    selectedFormat={selectedFormat}
                    selectedPreset={selectedPreset}
                    onFormatChange={setSelectedFormat}
                    onPresetChange={setSelectedPreset}
                    onConvert={handleConvert}
                    isLoading={false}
                  />
                )}

                {(phase === 'converting' || phase === 'cancelling') && (
                  <ConversionProgress
                    progress={progress}
                    status={conversionStatus}
                    onCancel={phase === 'converting' ? handleCancel : undefined}
                  />
                )}

                {phase === 'complete' && convertedBlob && stats && selectedFile && (
                  <ConversionResult
                    file={selectedFile}
                    stats={stats}
                    blob={convertedBlob}
                    onConvertAnother={handleReset}
                  />
                )}

                {phase === 'error' && (
                  <div className="text-center space-y-4">
                    <p className="text-sm text-muted-foreground">Something went wrong during conversion.</p>
                    <button
                      onClick={handleReset}
                      className="text-primary hover:underline text-sm font-medium"
                    >
                      Try Again
                    </button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
