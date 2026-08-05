import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useConfirmationStore } from '@/hooks/stores/confirmation-store';

export function ConfirmationDialog() {
  const { isOpen, title, description, onConfirm, closeConfirmation } = useConfirmationStore();

  return (
    <Dialog
      open={isOpen}
      onOpenChange={closeConfirmation}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={closeConfirmation}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm();
              closeConfirmation();
            }}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
