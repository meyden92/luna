import { CheckCircle2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getExtension } from '@/libs/converter/format-presets';
import { downloadBlob } from '@/libs/converter/video-converter';
import { formatSize } from '@/libs/utils';
import type { ConversionStats } from '@/types/converter';
import styles from './ConversionResult.module.css';

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
    <div className="stack">
      <Card className={styles.card}>
        <CardHeader>
          <div className="cluster space-2">
            <CheckCircle2 className={styles.checkIcon} />
            <CardTitle>Conversion Complete!</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="stack">
          <div className={styles.stats}>
            <div className={styles.row}>
              <span className={styles.label}>Original File:</span>
              <span className={styles.value}>
                {formatSize(stats.originalSize, CONVERSION_SIZE_OPTIONS)} ({stats.originalFormat})
              </span>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>Converted File:</span>
              <span className={styles.value}>
                {formatSize(stats.convertedSize, CONVERSION_SIZE_OPTIONS)} ({stats.convertedFormat.toUpperCase()})
              </span>
            </div>
            <div className={`${styles.row} ${styles.savedRow}`}>
              <span className={styles.label}>Space Saved:</span>
              <span className={styles.savedValue}>
                {formatSize(savedBytes, CONVERSION_SIZE_OPTIONS)} ({savingPercent}%)
              </span>
            </div>
          </div>

          <Button
            onClick={handleDownload}
            className={styles.download}
            size="lg"
          >
            <Download />
            Download Audio File
          </Button>
        </CardContent>
      </Card>

      <Button
        onClick={onConvertAnother}
        variant="outline"
        className={styles.again}
      >
        Convert Another File
      </Button>
    </div>
  );
}
