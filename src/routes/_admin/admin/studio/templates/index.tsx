import { createFileRoute } from '@tanstack/react-router';
import { studioTemplatesQueryOptions } from '@/components/admin/studio/queries';
import { TemplateList } from '@/components/admin/studio/TemplateList';

export const Route = createFileRoute('/_admin/admin/studio/templates/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(studioTemplatesQueryOptions),
  head: () => ({ meta: [{ title: 'Studio templates | LunaShare' }] }),
  component: TemplateList,
});
