import { createFileRoute } from '@tanstack/react-router';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

export const Route = createFileRoute('/_dashboard/preview/squi')({
  head: () => ({ meta: [{ title: 'Squi | LunaShare' }] }),
  component: SquiPage,
});

function SquiPage() {
  return (
    <main>
      <div className="ml-2">
        <h1 className="text-3xl font-bold">Website Title</h1>
        <p className="text-sm font-bold text-neutral-900">Placeholder text</p>
      </div>
      <Separator className="my-2" />

      <div className="flex justify-between items-start ml-2">
        <ul>
          <li>Home</li>
          <li>Favoriten</li>
          <li>Rezepte</li>
        </ul>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Rezepte suchen"
            className="flex-1"
          />
          <div>Irgendetwas anderes</div>
        </div>
      </div>
    </main>
  );
}
