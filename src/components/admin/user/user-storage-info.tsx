import { FileText, FolderUp, Save } from 'lucide-react';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { queryKeys } from '@/libs/query-keys';
import { quotaBytesToMiB } from '@/libs/storage-quota';
import { formatSize } from '@/libs/utils';
import { updateAdminUserStorageQuota } from '@/server/fns/admin/users';
import styles from './user-storage-info.module.css';

interface UserStorageInfoProps {
  userId: string;
  totalSize: number;
  quotaBytes: number;
  storageQuotaMiB: number;
  percentageUsed: number;
  fileCount: number;
}

function quotaMiBToGiBInput(storageQuotaMiB: number): string {
  const value = storageQuotaMiB / 1024;
  return Number.isInteger(value) ? String(value) : String(Number.parseFloat(value.toFixed(2)));
}

export default function UserStorageInfo({
  userId,
  totalSize,
  quotaBytes,
  storageQuotaMiB,
  percentageUsed,
  fileCount,
}: UserStorageInfoProps) {
  const [quotaGiB, setQuotaGiB] = useState(quotaMiBToGiBInput(storageQuotaMiB));
  const { mutate: updateQuota, isPending } = useAppMutation(updateAdminUserStorageQuota, {
    successMessage: 'Storage quota updated',
    errorMessage: 'Failed to update storage quota',
    invalidates: [queryKeys.admin.user(userId), queryKeys.admin.users],
  });

  useEffect(() => {
    setQuotaGiB(quotaMiBToGiBInput(storageQuotaMiB));
  }, [storageQuotaMiB]);

  const handleQuotaSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedQuotaGiB = Number(quotaGiB);
    if (!Number.isFinite(parsedQuotaGiB) || parsedQuotaGiB < 0) {
      toast.error('Quota must be a non-negative number');
      return;
    }
    updateQuota({ id: userId, storageQuotaMiB: quotaBytesToMiB(parsedQuotaGiB * 1024 * 1024 * 1024) });
  };

  return (
    <Card>
      <CardContent className={styles.body}>
        <h3 className={styles.heading}>
          <FolderUp className={styles.headingIcon} />
          Storage Usage
        </h3>
        <div className="stack space-4">
          <div>
            <div className={styles.usageHead}>
              <Label className={styles.fieldLabel}>Space Used</Label>
              <span className={styles.usageValue}>
                {formatSize(totalSize)} / {formatSize(quotaBytes)}
              </span>
            </div>
            <Progress
              value={percentageUsed}
              className={styles.bar}
            />
            <p className={styles.hint}>{percentageUsed}% of allocated storage</p>
          </div>
          <form
            className="stack space-2"
            onSubmit={handleQuotaSubmit}
          >
            <Label
              htmlFor="storage-quota-gib"
              className={styles.fieldLabel}
            >
              Storage Quota
            </Label>
            <div className={styles.quotaRow}>
              <Input
                id="storage-quota-gib"
                type="number"
                min="0"
                step="0.25"
                value={quotaGiB}
                onChange={(event) => setQuotaGiB(event.target.value)}
                disabled={isPending}
              />
              <Button
                type="submit"
                size="icon"
                disabled={isPending}
              >
                <Save />
                <span className="sr-only">Save storage quota</span>
              </Button>
            </div>
            <p className={styles.unitHint}>Quota is entered in GiB.</p>
          </form>
          <div>
            <Label className={styles.fieldLabel}>Files Uploaded</Label>
            <p className={styles.fileCount}>
              <FileText className={styles.fileIcon} />
              {fileCount} files
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
