import { createFileRoute, notFound } from '@tanstack/react-router';
import { z } from 'zod';
import { studioCatalogQueryOptions } from '@/components/studio/queries';
import { StudioScreen } from '@/components/studio/StudioScreen';
import { studioStatusQueryOptions } from '@/components/studio/studio-status';

const searchSchema = z.object({
  category: z.string().optional(),
  model: z.string().optional(),
  template: z.string().optional(),
});

/** The Studio: exists only while it is enabled. The search params name the selected Category and Model or Template. */
export const Route = createFileRoute('/_dashboard/studio')({
  validateSearch: searchSchema,
  beforeLoad: async ({ context }) => {
    const status = await context.queryClient.ensureQueryData(studioStatusQueryOptions);
    if (!status.enabled) throw notFound();
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(studioCatalogQueryOptions),
  head: () => ({ meta: [{ title: 'Studio | LunaShare' }] }),
  component: StudioPage,
});

function StudioPage() {
  const selection = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <StudioScreen
      selection={selection}
      onSelect={(next) => navigate({ search: next, replace: true })}
    />
  );
}
