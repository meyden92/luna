import { CheckCircle2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getExtension } from '@/libs/converter/format-presets';
import { downloadBlob } from '@/libs/converter/video-converter';
import { formatSize } from '@/libs/utils';
import type { ConversionStats } from '@/types/converter';

interface ConversionResultProps {
  file: File;
  stats: ConversionStats;
  blob: Blob;
  onConvertAnother: () => void;
}

const CONVERSION_SIZE_OPTIONS = { precision: 1 } as const;

export function ConversionResult({ file, stats, blob, onConvertAnother }: ConversionResultProps) {
  const savedBytes = stats.originalSize - stats.convertedSize;
  const savingPercent = ((savedBytes / stats.originalSize) * 100).toFixed(1);
  const ext = getExtension(stats.convertedFormat, 'balanced');
  const outputFilename = `${file.name.replace(/\.[^.]+$/, '')}-converted.${ext}`;

  const handleDownload = () => {
    downloadBlob(blob, outputFilename);
  };

  return (
    <div className="space-y-4">
      <Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-green-600 dark:text-green-400" />
            <CardTitle>Conversion Complete!</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Original File:</span>
              <span className="font-medium">
                {formatSize(stats.originalSize, CONVERSION_SIZE_OPTIONS)} ({stats.originalFormat})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Converted File:</span>
              <span className="font-medium">
                {formatSize(stats.convertedSize, CONVERSION_SIZE_OPTIONS)} ({stats.convertedFormat.toUpperCase()})
              </span>
            </div>
            <div className="border-t pt-2 flex justify-between">
              <span className="text-muted-foreground">Space Saved:</span>
              <span className="font-medium text-green-600 dark:text-green-400">
                {formatSize(savedBytes, CONVERSION_SIZE_OPTIONS)} ({savingPercent}%)
              </span>
            </div>
          </div>

          <Button
            onClick={handleDownload}
            className="w-full gap-2"
            size="lg"
          >
            <Download className="size-4" />
            Download Audio File
          </Button>
        </CardContent>
      </Card>

      <Button
        onClick={onConvertAnother}
        variant="outline"
        className="w-full"
      >
        Convert Another File
      </Button>
    </div>
  );
}
