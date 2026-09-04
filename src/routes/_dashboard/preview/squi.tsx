import { createFileRoute } from '@tanstack/react-router';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/libs/utils';
import styles from './squi.module.css';

export const Route = createFileRoute('/_dashboard/preview/squi')({
  head: () => ({ meta: [{ title: 'Squi | LunaShare' }] }),
  component: SquiPage,
});

function SquiPage() {
  return (
    <main>
      <div className={styles.header}>
        <h1 className="type-3xl weight-bold">Website Title</h1>
        <p className={cn('type-sm weight-bold', styles.subtitle)}>Placeholder text</p>
      </div>
      <Separator className="margin-top-2 margin-bottom-2" />

      <div className={styles.nav}>
        <ul>
          <li>Home</li>
          <li>Favoriten</li>
          <li>Rezepte</li>
        </ul>
        <div className={styles.search}>
          <Input
            placeholder="Rezepte suchen"
            className={styles.searchInput}
          />
          <div>Irgendetwas anderes</div>
        </div>
      </div>
    </main>
  );
}
