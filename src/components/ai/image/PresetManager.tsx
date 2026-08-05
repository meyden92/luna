import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { queryKeys } from '@/libs/query-keys';
import { createImagePreset, deleteImagePreset, listImagePresets } from '@/server/fns/ai-presets';

interface PresetManagerProps {
  modelId: string;
  currentFieldValues: Record<string, any>;
  onLoadPreset: (fieldValues: Record<string, any>) => void;
}

export function PresetManager({ modelId, currentFieldValues, onLoadPreset }: PresetManagerProps) {
  const queryClient = useQueryClient();
  const presetsKey = queryKeys.ai.presets(modelId);
  const { data: presets = [] } = useQuery({
    queryKey: presetsKey,
    queryFn: () => listImagePresets({ data: { modelId } }),
    staleTime: 30_000,
  });
  const saveMutation = useMutation({
    mutationFn: (vars: { name: string; fieldValues: Record<string, unknown> }) =>
      createImagePreset({ data: { modelId, name: vars.name, fieldValues: vars.fieldValues } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: presetsKey }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteImagePreset({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: presetsKey }),
  });
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [newPresetName, setNewPresetName] = useState('');
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);

  const handlePresetSelect = (presetId: string | null) => {
    if (!presetId) return;
    setSelectedPresetId(presetId);
    const preset = presets.find((p) => p.id === presetId);
    if (preset) {
      onLoadPreset(preset.fieldValues as Record<string, unknown>);
    }
  };

  const handleSavePreset = () => {
    if (!newPresetName.trim()) return;
    saveMutation.mutate({ name: newPresetName.trim(), fieldValues: currentFieldValues });
    setNewPresetName('');
    setIsSaveDialogOpen(false);
  };

  const handleDeletePreset = (presetId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteMutation.mutate(presetId);
    if (selectedPresetId === presetId) {
      setSelectedPresetId('');
    }
  };

  const selectedPreset = presets.find((p) => p.id === selectedPresetId);

  return (
    <div className="space-y-2">
      <Label>Saved Presets</Label>
      <div className="flex gap-2">
        <Select
          value={selectedPresetId}
          onValueChange={handlePresetSelect}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select a preset...">{selectedPreset?.name || 'Select a preset...'}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {presets.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">No presets saved for this model</div>
            ) : (
              presets.map((preset) => (
                <SelectItem
                  key={preset.id}
                  value={preset.id}
                >
                  <div className="flex items-center justify-between w-full gap-2">
                    <span>{preset.name}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="h-5 w-5 opacity-60 hover:opacity-100"
                      onClick={(e) => handleDeletePreset(preset.id, e)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        <Dialog
          open={isSaveDialogOpen}
          onOpenChange={setIsSaveDialogOpen}
        >
          <DialogTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                title="Save current settings as preset"
              />
            }
          >
            <Star className="h-4 w-4" />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save Preset</DialogTitle>
              <DialogDescription>Save the current field configuration as a reusable preset.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="preset-name">Preset Name</Label>
                <Input
                  id="preset-name"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder="Enter preset name..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSavePreset();
                    }
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
              <Button
                onClick={handleSavePreset}
                disabled={!newPresetName.trim()}
              >
                Save Preset
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
