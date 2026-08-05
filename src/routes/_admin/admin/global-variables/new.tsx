import { createFileRoute } from '@tanstack/react-router';
import { GlobalVariableForm } from '@/components/admin/global-variables/global-variable-form';

export const Route = createFileRoute('/_admin/admin/global-variables/new')({
  head: () => ({ meta: [{ title: 'New Global Variable | LunaShare' }] }),
  component: NewGlobalVariablePage,
});

function NewGlobalVariablePage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Create Global Variable</h1>
        <p className="text-muted-foreground">Add a new reusable variable.</p>
      </div>
      <GlobalVariableForm mode="create" />
    </div>
  );
}
