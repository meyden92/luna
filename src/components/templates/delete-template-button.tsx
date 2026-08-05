import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { deleteAdminTemplate } from '@/server/fns/admin/templates';

interface DeleteTemplateButtonProps {
  templateId: string;
  templateName: string;
}

export function DeleteTemplateButton({ templateId, templateName }: DeleteTemplateButtonProps) {
  const [open, setOpen] = useState(false);

  const { mutate, isPending } = useAppMutation(deleteAdminTemplate, {
    successMessage: 'Template deleted successfully',
    errorMessage: 'Failed to delete template',
    onSuccess: () => setOpen(false),
  });

  const handleDelete = () => {
    mutate({ id: templateId });
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={setOpen}
    >
      <AlertDialogTrigger className={`${buttonVariants({ variant: 'destructive', size: 'sm' })} p-0`}>
        <Trash2 className="w-4 h-4" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Template</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete the template "{templateName}"? This action cannot be undone and will also delete all associated
            preview images.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? 'Deleting...' : 'Delete Template'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
