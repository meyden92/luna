import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { GlobalVariableForm } from '@/components/admin/global-variables/global-variable-form';
import { queryKeys } from '@/libs/query-keys';
import { cn } from '@/libs/utils';
import { getGlobalVariable } from '@/server/fns/admin/global-variables';
import styles from './edit.module.css';

const globalVariableQueryOptions = (id: string) =>
  queryOptions({
    queryKey: queryKeys.adminGlobalVars.detail(id),
    queryFn: () => getGlobalVariable({ data: { id } }),
  });

export const Route = createFileRoute('/_admin/admin/global-variables/$id/edit')({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(globalVariableQueryOptions(params.id));
    } catch {
      throw notFound();
    }
  },
  head: () => ({ meta: [{ title: 'Edit Global Variable | LunaShare' }] }),
  component: EditGlobalVariablePage,
});

function EditGlobalVariablePage() {
  const { id } = Route.useParams();
  const { data: variable } = useSuspenseQuery(globalVariableQueryOptions(id));

  return (
    <div className={styles.root}>
      <div className="margin-bottom-8">
        <h1 className="type-3xl weight-bold">Edit Global Variable</h1>
        <p className={cn(styles.subtitle, 'type-base')}>Update variable configuration.</p>
      </div>
      <GlobalVariableForm
        mode="edit"
        initialData={variable}
      />
    </div>
  );
}
