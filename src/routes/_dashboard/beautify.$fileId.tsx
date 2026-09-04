import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { ImageOff } from 'lucide-react';
import { BeautifierEditor } from '@/components/beautifier/beautifier-editor';
import { Button } from '@/components/ui/button';
import { cn } from '@/libs/utils';
import { getBeautifierSourceFile } from '@/server/fns/beautifier';
import styles from './beautify.$fileId.module.css';

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
    <section className={styles.state}>
      <div className={styles.stateInner}>
        <div className={styles.icon}>
          <ImageOff className={styles.iconSvg} />
        </div>
        <h1 className={cn('type-display', styles.title)}>{title}</h1>
        <p className={cn('type-sm', styles.description)}>{description}</p>
        <Button
          className="margin-top-6"
          render={<Link to="/dashboard" />}
        >
          Back to gallery
        </Button>
      </div>
    </section>
  );
}
