import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { ImageOff } from 'lucide-react';
import { BeautifierEditor } from '@/components/beautifier/beautifier-editor';
import { Button } from '@/components/ui/button';
import { getBeautifierSourceFile } from '@/server/fns/beautifier';

export const Route = createFileRoute('/_dashboard/beautify/$fileId')({
  loader: async ({ params }) => {
    const result = await getBeautifierSourceFile({ data: { fileId: params.fileId } });
    if (result.status === 'not-found') throw notFound();
    return result;
  },
  head: () => ({ meta: [{ title: 'Beautify Screenshot | LunaShare' }] }),
  notFoundComponent: () => (
    <BeautifierState
      title="File not found"
      description="This file may have been deleted, moved to another account, or the link may be incorrect."
    />
  ),
  component: BeautifyFilePage,
});

function BeautifyFilePage() {
  const result = Route.useLoaderData();

  if (result.status === 'not-image') {
    return (
      <BeautifierState
        title="Image required"
        description="The beautifier can only render image files from your gallery."
      />
    );
  }

  return <BeautifierEditor source={result.file} />;
}

function BeautifierState({ title, description }: { title: string; description: string }) {
  return (
    <section className="flex min-h-[calc(100dvh-9rem)] items-center justify-center px-4 py-12">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-[12px] border border-luna-line bg-luna-bg-2 text-luna-ink-3">
          <ImageOff className="h-6 w-6" />
        </div>
        <h1 className="font-serif text-[38px] font-normal leading-none text-luna-ink">{title}</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-luna-ink-3">{description}</p>
        <Button
          className="mt-6"
          render={<Link to="/dashboard" />}
        >
          Back to gallery
        </Button>
      </div>
    </section>
  );
}
