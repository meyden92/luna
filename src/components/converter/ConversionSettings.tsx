import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AudioFormat, QualityPreset } from '@/types/converter';
import { SUPPORTED_AUDIO_FORMATS } from '@/types/converter';
import styles from './ConversionSettings.module.css';

interface ConversionSettingsProps {
  file: File;
  fileFormat: string;
  selectedFormat: AudioFormat;
  selectedPreset: QualityPreset;
  onFormatChange: (format: AudioFormat) => void;
  onPresetChange: (preset: QualityPreset) => void;
  onConvert: () => void;
  isLoading?: boolean;
}

const PRESET_DESCRIPTIONS: Record<QualityPreset, string> = {
  high: 'Highest quality, larger file size',
  balanced: 'Good quality and file size (recommended)',
  small: 'Smallest file size, lower quality',
};

export function ConversionSettings({
  file,
  fileFormat,
  selectedFormat,
  selectedPreset,
  onFormatChange,
  onPresetChange,
  onConvert,
  isLoading = false,
}: ConversionSettingsProps) {
  const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);

  return (
    <div className="stack">
      <Card>
        <CardHeader>
          <CardTitle className="type-base">File Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={styles.details}>
            <div className={styles.row}>
              <span className={styles.label}>File:</span>
              <span className={styles.value}>{file.name}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>Size:</span>
              <span className={styles.value}>{fileSizeMB} MB</span>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>Format:</span>
              <span className={styles.valueUpper}>{fileFormat}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="type-base">Conversion Settings</CardTitle>
          <CardDescription>Choose output format and quality preset</CardDescription>
        </CardHeader>
        <CardContent className="stack">
          <div className="stack space-2">
            <label className={styles.fieldLabel}>Output Format</label>
            <Select
              value={selectedFormat}
              onValueChange={(val) => val && onFormatChange(val as AudioFormat)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_AUDIO_FORMATS.map((format) => (
                  <SelectItem
                    key={format}
                    value={format}
                  >
                    {format.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="stack space-2">
            <label className={styles.fieldLabel}>Quality Preset</label>
            <Select
              value={selectedPreset}
              onValueChange={(val) => val && onPresetChange(val as QualityPreset)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">High Quality</SelectItem>
                <SelectItem value="balanced">Balanced</SelectItem>
                <SelectItem value="small">Small Size</SelectItem>
              </SelectContent>
            </Select>
            <p className={styles.hint}>{PRESET_DESCRIPTIONS[selectedPreset]}</p>
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={onConvert}
        disabled={isLoading}
        className={styles.convert}
        size="lg"
      >
        {isLoading ? 'Converting...' : 'Convert to Audio'}
      </Button>
    </div>
  );
}
