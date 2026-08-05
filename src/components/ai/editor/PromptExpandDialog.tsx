import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

interface PromptExpandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  value: string;
  onSave: (value: string) => void;
  onSubmitShortcut?: (value: string) => void;
  maxLength?: number;
  showCharCount?: boolean;
}

export function PromptExpandDialog({
  open,
  onOpenChange,
  title,
  value,
  onSave,
  onSubmitShortcut,
  maxLength,
  showCharCount,
}: PromptExpandDialogProps) {
  const [localValue, setLocalValue] = useState(value);

  // Sync local value when dialog opens
  useEffect(() => {
    if (open) {
      setLocalValue(value);
    }
  }, [open, value]);

  const handleSave = useCallback(() => {
    onSave(localValue);
    onOpenChange(false);
  }, [localValue, onSave, onOpenChange]);

  const handleSubmitShortcut = useCallback(() => {
    onSave(localValue);
    onOpenChange(false);
    onSubmitShortcut?.(localValue);
  }, [localValue, onSave, onOpenChange, onSubmitShortcut]);

  // Handle Ctrl+S keyboard shortcut
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSubmitShortcut();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleSave, handleSubmitShortcut]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col flex-1 min-h-0 gap-2">
          <Textarea
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            maxLength={maxLength}
            className="flex-1 min-h-0 resize-none font-mono"
            autoFocus
          />
          {showCharCount && (
            <p className="text-xs text-muted-foreground text-right shrink-0">
              {localValue.length}
              {maxLength ? ` / ${maxLength}` : ''} characters
            </p>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={handleSave}>
            Save
            <span className="ml-2 text-xs opacity-70">Ctrl+S</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
