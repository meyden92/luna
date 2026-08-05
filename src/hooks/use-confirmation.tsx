import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export interface ConfirmOptions<T> {
  title: string;
  description: string;
  onConfirm: (data: T) => void;
  onCancel?: (data: T) => void;
  data: T;
}

export function useConfirmation<T>() {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions<T> | null>(null);

  const confirm = useCallback((confirmOptions: ConfirmOptions<T>) => {
    setOptions(confirmOptions);
    setIsOpen(true);
  }, []);

  const handleConfirm = useCallback(() => {
    if (options) {
      options.onConfirm(options.data);
    }
    setIsOpen(false);
  }, [options]);

  const handleCancel = useCallback(() => {
    if (options?.onCancel) {
      options.onCancel(options.data);
    }
    setIsOpen(false);
  }, [options]);

  const ConfirmationDialog = useCallback(() => {
    if (!options) return null;

    return (
      <Dialog
        open={isOpen}
        onOpenChange={(open) => setIsOpen(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{options.title}</DialogTitle>
            <DialogDescription>{options.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancel}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirm}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }, [isOpen, options, handleCancel, handleConfirm]);

  return { confirm, ConfirmationDialog };
}
