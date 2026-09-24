import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useFolders } from '@/contexts/FoldersContext';
import { Field, FieldHint, FieldLabel, FieldName, FieldValue } from './field';
import { QUALITIES, qualityForSteps } from './generation-options';
import styles from './generation-settings-sheet.module.css';

/** Everything the prompt bar does not show inline. */
export interface GenerationSettings {
  steps: number;
  seed: string;
  /**
   * Folder the generated files are filed into. Null does not mean "unsaved" —
   * every result is stored in Files either way — only that it stays unsorted.
   */
  saveToFolderId: string | null;
}

const NO_FOLDER = '';

interface GenerationSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: GenerationSettings;
  onChange: (settings: GenerationSettings) => void;
  onReset: () => void;
}

/**
 * The drawer behind the quality button on the prompt bar. Quality and detail
 * steps are two views of one number: picking a quality sets the steps, and
 * moving the slider off all three presets leaves quality showing "Custom".
 */
function GenerationSettingsSheet({ open, onOpenChange, settings, onChange, onReset }: GenerationSettingsSheetProps) {
  const { folders } = useFolders();
  const quality = qualityForSteps(settings.steps);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
    >
      <SheetContent
        side="right"
        className={styles.sheet}
      >
        <SheetHeader>
          <SheetTitle>Generation settings</SheetTitle>
          <SheetDescription>Defaults work well for most prompts.</SheetDescription>
        </SheetHeader>

        <div className={styles.body}>
          <Field>
            <FieldName>Quality</FieldName>
            <ToggleGroup
              aria-label="Quality"
              variant="outline"
              size="sm"
              value={quality ? [quality] : []}
              onValueChange={(value) => {
                const next = QUALITIES.find((entry) => entry.value === value[0]);
                if (next) onChange({ ...settings, steps: next.steps });
              }}
            >
              {QUALITIES.map((entry) => (
                <ToggleGroupItem
                  key={entry.value}
                  value={entry.value}
                >
                  {entry.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldHint>Fast is good for trying ideas. Best takes about 4× longer.</FieldHint>
          </Field>

          <Field>
            <FieldName>
              Detail steps
              <FieldValue>{settings.steps}</FieldValue>
            </FieldName>
            <Slider
              value={[settings.steps]}
              min={1}
              max={30}
              step={1}
              thumbAriaLabel="Detail steps"
              onValueChange={(value) => onChange({ ...settings, steps: Array.isArray(value) ? value[0]! : value })}
            />
            <FieldHint>More steps add detail but take longer.</FieldHint>
          </Field>

          <Field>
            <FieldLabel htmlFor="generation-seed">Seed</FieldLabel>
            <Input
              id="generation-seed"
              inputMode="numeric"
              placeholder="Random each time"
              value={settings.seed}
              onChange={(event) => onChange({ ...settings, seed: event.target.value })}
            />
            <FieldHint>Use the same seed and prompt to get the same image again.</FieldHint>
          </Field>

          <Field>
            <FieldName>Save results to</FieldName>
            <Select
              value={settings.saveToFolderId ?? NO_FOLDER}
              onValueChange={(value) => onChange({ ...settings, saveToFolderId: value === NO_FOLDER ? null : String(value) })}
            >
              <SelectTrigger
                aria-label="Save results to"
                size="sm"
                className={styles.folderTrigger}
              >
                <SelectValue>
                  {(settings.saveToFolderId && folders.find((folder) => folder.id === settings.saveToFolderId)?.name) || 'Not in a folder'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_FOLDER}>Not in a folder</SelectItem>
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
            <FieldHint>Results always land in your files. This only picks the folder.</FieldHint>
          </Field>
        </div>

        <SheetFooter className={styles.footer}>
          <Button
            variant="ghost"
            onClick={onReset}
          >
            Reset to defaults
          </Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export { GenerationSettingsSheet };
