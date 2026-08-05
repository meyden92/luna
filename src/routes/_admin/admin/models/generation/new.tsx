import { createFileRoute } from '@tanstack/react-router';
import ModelForm from '@/components/admin/models/ModelForm';

export const Route = createFileRoute('/_admin/admin/models/generation/new')({
  head: () => ({ meta: [{ title: 'New Generation Model | LunaShare' }] }),
  component: NewGenerationModelPage,
});

function NewGenerationModelPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Add New Model</h1>
      <ModelForm />
    </div>
  );
}
