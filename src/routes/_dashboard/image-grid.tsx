import { createFileRoute } from '@tanstack/react-router';
import { ImageGridGenerator } from '@/components/image-grid/image-grid-generator';

export const Route = createFileRoute('/_dashboard/image-grid')({
  head: () => ({ meta: [{ title: 'Image Grid | LunaShare' }] }),
  component: ImageGridPage,
});

function ImageGridPage() {
  return (
    <section className="container mx-auto py-6">
      <ImageGridGenerator />
    </section>
  );
}
