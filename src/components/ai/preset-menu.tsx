import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { queryKeys } from '@/libs/query-keys';
import { createImagePreset, deleteImagePreset, type ImagePresetDTO, listImagePresets } from '@/server/fns/ai-presets';
import { Field, FieldLabel } from './field';

interface PresetMenuProps {
  modelId: string;
  modelLabel: string;
  /** The current Create settings as this model's field values, which is what a preset stores. */
  currentFieldValues: () => Record<string, unknown>;
  onApply: (fieldValues: Record<string, unknown>) => void;
}

/**
 * Saved Create settings for one model, on the prompt bar: apply one, save the
 * current settings under a name, or delete one. Presets belong to a model because
 * each stores that model's own field values.
 */
function PresetMenu({ modelId, modelLabel, currentFieldValues, onApply }: PresetMenuProps) {
  const queryClient = useQueryClient();
  const presetsKey = queryKeys.ai.presets(modelId);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [name, setName] = React.useState('');

  const { data: presets = [] } = useQuery({
    queryKey: presetsKey,
    queryFn: () => listImagePresets({ data: { modelId } }),
    staleTime: 30_000,
  });

  const save = useMutation({
    mutationFn: (presetName: string) => createImagePreset({ data: { modelId, name: presetName, fieldValues: currentFieldValues() } }),
    onSuccess: (_result, presetName) => {
      setSaveOpen(false);
      toast.success(`Preset “${presetName}” saved`);
    },
    onError: () => toast.error('Could not save the preset'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: presetsKey }),
  });

  const remove = useMutation({
    mutationFn: (preset: ImagePresetDTO) => deleteImagePreset({ data: { id: preset.id } }),
    onSuccess: (_result, preset) => toast.success(`Preset “${preset.name}” deleted`),
    onError: () => toast.error('Could not delete the preset'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: presetsKey }),
  });

  const apply = (preset: ImagePresetDTO) => {
    const values = preset.fieldValues;
    if (values && typeof values === 'object' && !Array.isArray(values)) onApply(values);
    toast.success(`Preset “${preset.name}” applied`);
  };

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed && !save.isPending) save.mutate(trimmed);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
            />
          }
        >
          <Bookmark size={14} />
          Presets
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Saved for {modelLabel}</DropdownMenuLabel>
            {presets.length === 0 ? (
              <DropdownMenuItem disabled>No presets yet</DropdownMenuItem>
            ) : (
              presets.map((preset) => (
                <DropdownMenuItem
                  key={preset.id}
                  onClick={() => apply(preset)}
                >
                  {preset.name}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setName('');
              setSaveOpen(true);
            }}
          >
            <Plus />
            Save current settings…
          </DropdownMenuItem>
          {presets.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Trash2 />
                Delete a preset
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {presets.map((preset) => (
                  <DropdownMenuItem
                    key={preset.id}
                    variant="destructive"
                    onClick={() => remove.mutate(preset)}
                  >
                    {preset.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as a preset</DialogTitle>
            <DialogDescription>Keeps the shape, number of images, quality and seed for {modelLabel}.</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="preset-name">Name</FieldLabel>
            <Input
              id="preset-name"
              autoFocus
              maxLength={100}
              placeholder="e.g. Wide wallpapers"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submit();
              }}
            />
          </Field>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSaveOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={!name.trim() || save.isPending}
              onClick={submit}
            >
              {save.isPending && <Spinner />}
              Save preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export { PresetMenu };
