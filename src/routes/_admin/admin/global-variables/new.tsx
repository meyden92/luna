import { createFileRoute } from '@tanstack/react-router';
import { GlobalVariableForm } from '@/components/admin/global-variables/global-variable-form';
import { cn } from '@/libs/utils';
import styles from './new.module.css';

export const Route = createFileRoute('/_admin/admin/global-variables/new')({
  head: () => ({ meta: [{ title: 'New Global Variable | LunaShare' }] }),
  component: NewGlobalVariablePage,
});

function NewGlobalVariablePage() {
  return (
    <div className={styles.root}>
      <div className="margin-bottom-8">
        <h1 className="type-3xl weight-bold">Create Global Variable</h1>
        <p className={cn(styles.subtitle, 'type-base')}>Add a new reusable variable.</p>
      </div>
      <GlobalVariableForm mode="create" />
    </div>
  );
}
