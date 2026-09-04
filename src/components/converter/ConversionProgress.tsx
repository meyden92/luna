import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import styles from './ConversionProgress.module.css';

interface ConversionProgressProps {
  progress: number;
  status: 'loading' | 'converting' | 'finalizing' | 'cancelling';
  onCancel?: () => void;
}

const STATUS_TEXT: Record<string, string> = {
  loading: 'Loading FFmpeg converter (one-time download)...',
  converting: 'Converting video to audio...',
  finalizing: 'Finalizing conversion...',
  cancelling: 'Cancelling conversion...',
};

export function ConversionProgress({ progress, status, onCancel }: ConversionProgressProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Conversion in Progress</CardTitle>
        <CardDescription>{STATUS_TEXT[status]}</CardDescription>
      </CardHeader>
      <CardContent className="stack">
        <div className="stack space-2">
          <div className={styles.row}>
            <span>Progress</span>
            <span className="weight-medium">{progress}%</span>
          </div>
          <Progress
            value={progress}
            className={styles.bar}
          />
        </div>

        {onCancel && (
          <Button
            onClick={onCancel}
            variant="outline"
            className={styles.cancel}
          >
            Cancel
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
