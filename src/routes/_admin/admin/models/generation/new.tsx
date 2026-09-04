import { createFileRoute } from '@tanstack/react-router';
import ModelForm from '@/components/admin/models/ModelForm';

export const Route = createFileRoute('/_admin/admin/models/generation/new')({
  head: () => ({ meta: [{ title: 'New Generation Model | LunaShare' }] }),
  component: NewGenerationModelPage,
});

function NewGenerationModelPage() {
  return (
    <div className="container pad-y-8">
      <h1 className="type-2xl weight-bold margin-bottom-6">Add New Model</h1>
      <ModelForm />
    </div>
  );
}
