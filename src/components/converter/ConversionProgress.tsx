import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

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
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progress</span>
            <span className="font-medium">{progress}%</span>
          </div>
          <Progress
            value={progress}
            className="h-2"
          />
        </div>

        {onCancel && (
          <Button
            onClick={onCancel}
            variant="outline"
            className="w-full"
          >
            Cancel
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
