import { createFileRoute } from '@tanstack/react-router';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { useConfirmation } from '@/hooks/use-confirmation';
import { purgeGenerativeCache } from '@/server/fns/admin/cache';

export const Route = createFileRoute('/_admin/admin/tasks/delete-cache')({
  head: () => ({ meta: [{ title: 'Delete Cache | LunaShare' }] }),
  component: DeleteCachePage,
});

function DeleteCachePage() {
  const { confirm, ConfirmationDialog } = useConfirmation();
  const { mutate: execute, isPending } = useAppMutation<void, Awaited<ReturnType<typeof purgeGenerativeCache>>>(
    () => purgeGenerativeCache(),
    {
      errorMessage: false,
      onSuccess: (data) => {
        toast.success(
          `Purge complete! Deleted ${data.details?.s3ObjectsDeleted} files, ${data.details?.dbCacheRecordsDeleted} cache records, and ${data.details?.dbGenerationRecordsDeleted} history records.`,
          { richColors: true },
        );
      },
      onError: (error) => {
        toast.error(`Failed to purge cache: ${error.message || 'Unknown error'}`, { richColors: true });
      },
    },
  );

  const handleDeleteCacheClick = useCallback(() => {
    confirm({
      title: 'Purge Cache & History?',
      description:
        'This will delete ALL cached images and ALL template generation history. This action cannot be undone. Are you sure you want to proceed?',
      onConfirm: () => execute(undefined),
      data: null,
    });
  }, [confirm, execute]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Purge Cache & History</h1>
        <p className="text-muted-foreground mt-2">Manually clear the entire image cache and reset all template generation history.</p>
      </div>

      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive">
        <h3 className="font-semibold flex items-center gap-2">Warning</h3>
        <p className="text-sm mt-1">This action is destructive and irreversible. It will:</p>
        <ul className="list-disc list-inside text-sm mt-2 ml-2 space-y-1">
          <li>
            Delete <strong>ALL</strong> cached images from S3 storage.
          </li>
          <li>
            Delete <strong>ALL</strong> cached image records from the database.
          </li>
          <li>
            Delete <strong>ALL</strong> user generation history for templates.
          </li>
        </ul>
      </div>

      <Button
        variant="destructive"
        onClick={handleDeleteCacheClick}
        disabled={isPending}
      >
        {isPending ? 'Purging...' : 'Purge All Cache & History'}
      </Button>

      <ConfirmationDialog />
    </div>
  );
}
