import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { storageStatusQueryOptions } from './queries';
import styles from './StorageStatusBanner.module.css';

/** Shown across the admin area until the Vault holds every Storage entry. */
export function StorageStatusBanner() {
  const { data } = useQuery(storageStatusQueryOptions);
  if (!data || data.storageConfigured) return null;
  return (
    <Alert
      variant="destructive"
      className={styles.banner}
    >
      <AlertTitle>Storage is not configured</AlertTitle>
      <AlertDescription>
        Uploads and downloads fail until the S3 connection and CDN URL are set in the <Link to="/admin/settings/vault">Vault</Link>.
      </AlertDescription>
    </Alert>
  );
}
