import { createFileRoute } from '@tanstack/react-router';
import EditingModelForm from '@/components/admin/editing-models/EditingModelForm';

export const Route = createFileRoute('/_admin/admin/models/editing/new')({
  head: () => ({ meta: [{ title: 'New Editing Model | LunaShare' }] }),
  component: NewEditingModelPage,
});

function NewEditingModelPage() {
  return (
    <div className="container pad-y-8">
      <h1 className="type-2xl weight-bold margin-bottom-6">Add New Editing Model</h1>
      <EditingModelForm />
    </div>
  );
}
