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
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <Link
          to="/"
          className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
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
    <section className="rounded-lg border bg-card p-4 shadow-sm sm:p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-2">
          <h1 className="break-words text-3xl font-bold">{snippet.title}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Created {format(new Date(snippet.createdAt), 'PP')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5" />
              {snippet.author.name || 'Unknown author'}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {snippet.language && (
            <Badge
              variant="secondary"
              className="w-fit"
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
              <Copy className="h-4 w-4" />
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
    <Empty className="rounded-lg border bg-card shadow-sm">
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
