import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_admin/admin/tasks/test-upload')({
  head: () => ({ meta: [{ title: 'Test Upload | LunaShare' }] }),
  component: TestUploadPage,
});

function TestUploadPage() {
  return (
    <div>
      <h1>Test Upload Page</h1>
      <p>This is a placeholder for the test upload functionality.</p>
    </div>
  );
}
