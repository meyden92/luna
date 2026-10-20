import { useQuery } from '@tanstack/react-query';
import { Download as DownloadIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
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

const HIGHLIGHT_MS = 2000;

const cardId = (downloadId: string) => `download-${downloadId}`;

/**
 * The `/tools/download` page: a link field that starts a Download, and the
 * User's Downloads below it. The list polls every second while anything is
 * still preparing; the Downloads live on the server, so leaving the page and
 * coming back finds them again. Pasting a post that already has a live Download
 * scrolls to and highlights that Download instead of starting another.
 */
export function Downloader() {
  const { data: downloads = [] } = useQuery({
    queryKey: queryKeys.downloads.list,
    queryFn: () => listDownloads(),
    refetchInterval: (query) => {
      const statuses = query.state.data?.map((download) => download.status) ?? [];
      if (statuses.some((status) => !isTerminal(status))) return 1000;
      // Slowly while anything is ready, so expiry shows up without a reload.
      return statuses.includes('ready') ? 30_000 : false;
    },
  });

  // The Download a repeated link led to, highlighted briefly once it is scrolled into view.
  const [highlightedId, setHighlightedId] = useState<string>();
  const { mutate: start, isPending } = useAppMutation(createDownload, {
    invalidates: [queryKeys.downloads.list],
    onSuccess: ({ id, existing }) => {
      if (!existing) return;
      document.getElementById(cardId(id))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedId(id);
    },
  });
  useEffect(() => {
    if (!highlightedId) return;
    const timeout = setTimeout(() => setHighlightedId(undefined), HIGHLIGHT_MS);
    return () => clearTimeout(timeout);
  }, [highlightedId]);

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
            <li
              key={download.id}
              id={cardId(download.id)}
            >
              <DownloadCard
                download={download}
                highlighted={download.id === highlightedId}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
