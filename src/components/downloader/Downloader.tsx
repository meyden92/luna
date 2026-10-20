import { useQuery } from '@tanstack/react-query';
import { Download as DownloadIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { FormSubmit, FormWithSchema, InputField } from '@/components/ui/tanstack-form';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { isTerminal } from '@/libs/downloads/types';
import { queryKeys } from '@/libs/query-keys';
import { createDownloadSchema } from '@/schemas/download-schema';
import { createDownload, listDownloads } from '@/server/fns/downloads';
import { DownloadCard } from './DownloadCard';
import styles from './Downloader.module.css';

/**
 * The `/tools/download` page: a link field that starts a Download, and the
 * User's Downloads below it. The list polls every second while anything is
 * still preparing; the Downloads live on the server, so leaving the page and
 * coming back finds them again.
 */
export function Downloader() {
  const { data: downloads = [] } = useQuery({
    queryKey: queryKeys.downloads.list,
    queryFn: () => listDownloads(),
    refetchInterval: (query) => (query.state.data?.some((download) => !isTerminal(download.status)) ? 1000 : false),
  });

  const { mutate: start, isPending } = useAppMutation(createDownload, {
    invalidates: [queryKeys.downloads.list],
  });

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <h1 className="type-2xl weight-bold">Downloader</h1>
        <p className={styles.lede}>Paste a link to an Instagram reel, video post or carousel to save its videos.</p>
      </header>

      <Card>
        <CardContent>
          <FormWithSchema
            config={{ schema: createDownloadSchema, defaultValues: { url: '' }, onSubmit: (values) => start(values) }}
            className={styles.form}
          >
            <InputField
              name="url"
              label="Link"
              placeholder="https://www.instagram.com/reel/…"
              className={styles.field}
              autoComplete="off"
            />
            <FormSubmit
              disabled={isPending}
              loadingText="Starting…"
            >
              Download
            </FormSubmit>
          </FormWithSchema>
        </CardContent>
      </Card>

      {downloads.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <DownloadIcon />
            </EmptyMedia>
            <EmptyTitle>No Downloads yet</EmptyTitle>
            <EmptyDescription>Paste a link above to start one.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className={styles.list}>
          {downloads.map((download) => (
            <li key={download.id}>
              <DownloadCard download={download} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
