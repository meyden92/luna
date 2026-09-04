import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { format } from 'date-fns';
import { Calendar, Copy, FileQuestion, Lock, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import CodeBlock from '@/components/bin/CustomHighlighter';
import { Brandmark } from '@/components/landing/Brandmark';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { queryKeys } from '@/libs/query-keys';
import { getSnippetById } from '@/server/fns/dashboard/snippets';
import styles from './bin.module.css';

const snippetQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.bins.detail(id),
    queryFn: () => getSnippetById({ data: { id } }),
  });

export const Route = createFileRoute('/bin/$snippet')({
  head: () => ({ meta: [{ title: 'Snippet | LunaShare' }] }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(snippetQuery(params.snippet)),
  component: BinDetailPage,
});

function BinDetailPage() {
  const { snippet: snippetId } = Route.useParams();
  const { data } = useSuspenseQuery(snippetQuery(snippetId));

  return (
    <main className={styles.root}>
      <div className={styles.page}>
        <Link
          to="/"
          className={`${styles.brand} type-sm`}
        >
          <Brandmark size={20} />
          LunaShare
        </Link>
        <SnippetDisplay data={data} />
      </div>
    </main>
  );
}

function SnippetDisplay({ data }: { data: Awaited<ReturnType<typeof getSnippetById>> }) {
  if (data.status === 'private') {
    return (
      <SnippetEmptyState
        icon={<Lock />}
        title="This snippet is private"
        description="You do not have access to view this snippet. Sign in with an account that has access, or ask the owner to make it public."
        actionLabel="Go to your snippets"
        actionTo="/bin"
      />
    );
  }

  if (data.status === 'not-found' || !data.snippet) {
    return (
      <SnippetEmptyState
        icon={<FileQuestion />}
        title="Snippet not found"
        description="This snippet may have been deleted, or the link may be incorrect."
        actionLabel="Go to your snippets"
        actionTo="/bin"
      />
    );
  }

  const { snippet } = data;
  const copyShareLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    toast.success('Share link copied', { richColors: true });
  };

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <h1 className={`${styles.title} type-3xl weight-bold`}>{snippet.title}</h1>
          <div className={`${styles.meta} type-sm`}>
            <span className={styles.metaItem}>
              <Calendar className={styles.metaIcon} />
              Created {format(new Date(snippet.createdAt), 'PP')}
            </span>
            <span className={styles.metaItem}>
              <UserRound className={styles.metaIcon} />
              {snippet.author.name || 'Unknown author'}
            </span>
          </div>
        </div>
        <div className={styles.actions}>
          {snippet.language && (
            <Badge
              variant="secondary"
              className={styles.badge}
            >
              {snippet.language}
            </Badge>
          )}
          <Badge variant={snippet.isPublic ? 'default' : 'outline'}>{snippet.isPublic ? 'Public' : 'Private'}</Badge>
          {(snippet.isPublic || data.viewerIsOwner) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyShareLink}
            >
              <Copy className={styles.actionIcon} />
              Copy link
            </Button>
          )}
        </div>
      </div>
      <CodeBlock
        language={snippet.language || 'text'}
        code={snippet.content}
      />
    </section>
  );
}

function SnippetEmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionTo,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  actionTo: '/bin' | '/login';
}) {
  return (
    <Empty className={styles.empty}>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link
          to={actionTo}
          className={buttonVariants()}
        >
          {actionLabel}
        </Link>
      </EmptyContent>
    </Empty>
  );
}
