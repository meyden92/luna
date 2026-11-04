import { queryOptions } from '@tanstack/react-query';
import { queryKeys } from '@/libs/query-keys';
import { getStudioModel, listStudioCategories, listStudioModels } from '@/server/fns/admin/studio';
import { getStudioOverview, getStudioSettingsForAdmin, getUserStudioBudget } from '@/server/fns/admin/studio-budgets';
import { getStudioTemplate, getTemplateDraftFromGeneration, listStudioTemplates } from '@/server/fns/admin/studio-templates';

export const studioCategoriesQueryOptions = queryOptions({
  queryKey: queryKeys.adminStudio.categories,
  queryFn: () => listStudioCategories(),
});

export const studioModelsQueryOptions = queryOptions({
  queryKey: queryKeys.adminStudio.models,
  queryFn: () => listStudioModels(),
});

export const studioModelQueryOptions = (id: string) =>
  queryOptions({
    queryKey: queryKeys.adminStudio.model(id),
    queryFn: () => getStudioModel({ data: { id } }),
  });

export const studioTemplatesQueryOptions = queryOptions({
  queryKey: queryKeys.adminStudio.templates,
  queryFn: () => listStudioTemplates(),
});

export const studioTemplateQueryOptions = (id: string) =>
  queryOptions({
    queryKey: queryKeys.adminStudio.template(id),
    queryFn: () => getStudioTemplate({ data: { id } }),
  });

/** *Save as Template*'s starting point; fails with the reason when the Generation's Model is gone. */
export const templateDraftQueryOptions = (generationId: string) =>
  queryOptions({
    queryKey: queryKeys.adminStudio.templateDraft(generationId),
    queryFn: () => getTemplateDraftFromGeneration({ data: { generationId } }),
    retry: false,
  });

export const studioOverviewQueryOptions = queryOptions({
  queryKey: queryKeys.adminStudio.overview,
  queryFn: () => getStudioOverview(),
});

export const studioSettingsQueryOptions = queryOptions({
  queryKey: queryKeys.adminStudio.settings,
  queryFn: () => getStudioSettingsForAdmin(),
});

export const userStudioBudgetQueryOptions = (userId: string) =>
  queryOptions({
    queryKey: queryKeys.adminStudio.userBudget(userId),
    queryFn: () => getUserStudioBudget({ data: { userId } }),
  });
