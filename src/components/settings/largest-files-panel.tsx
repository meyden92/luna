import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatSize, getCDNImage, getFileIcon } from '@/libs/utils';
import { getGallery } from '@/server/fns/files';
import styles from './largest-files-panel.module.css';
import { SettingsPanel, SettingsPanelHeader } from './settings-panel';

const LARGEST_FILES_LIMIT = 5;

/**
 * Largest files: the real top-5 by size, via the same `getGallery` query
 * Files uses. "Show" deep-links into Files via its `file` search param, which
 * opens that file in Preview.
 */
export function LargestFilesPanel() {
  const { data } = useQuery({
    queryKey: ['settings', 'storage', 'largest'],
    queryFn: () => getGallery({ data: { limit: LARGEST_FILES_LIMIT, sortBy: 'size', sortDirection: 'desc' } }),
  });

  const files = data?.files ?? [];

  return (
    <SettingsPanel>
      <SettingsPanelHeader
        title="Largest files"
        description="Deleting these frees the most space."
      />
      {files.length === 0 ? (
        <p className={styles.empty}>No files yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.map((file) => {
              const isImage = file.contentType.startsWith('image/');
              const Icon = getFileIcon(file.contentType);
              return (
                <TableRow key={file.id}>
                  <TableCell>
                    <div className={styles.fileCell}>
                      <div className={styles.thumb}>
                        {isImage ? (
                          <img
                            src={getCDNImage(file.url, file.ownerId)}
                            alt=""
                            className={styles.thumbImage}
                          />
                        ) : (
                          <Icon className={styles.thumbIcon} />
                        )}
                      </div>
                      <span className={styles.name}>{file.title}</span>
                    </div>
                  </TableCell>
                  <TableCell>{formatSize(file.size)}</TableCell>
                  <TableCell>{new Date(file.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className={styles.actionsCell}>
                    <Button
                      size="xs"
                      variant="ghost"
                      render={
                        <Link
                          to="/dashboard"
                          search={{ file: file.id }}
                        />
                      }
                    >
                      Show
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </SettingsPanel>
  );
}
