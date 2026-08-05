import { createFileRoute } from '@tanstack/react-router';
import EditingModelForm from '@/components/admin/editing-models/EditingModelForm';

export const Route = createFileRoute('/_admin/admin/models/editing/new')({
  head: () => ({ meta: [{ title: 'New Editing Model | LunaShare' }] }),
  component: NewEditingModelPage,
});

function NewEditingModelPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Add New Editing Model</h1>
      <EditingModelForm />
    </div>
  );
}
