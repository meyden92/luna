import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import * as ai from '@/db/queries/ai';
import { createEditingModelSchema, updateEditingModelSchema } from '@/schemas/admin/editing-model-schema';
import { createModelSchema, updateModelSchema } from '@/schemas/admin/model-schema';
import { userIdFromCtx as adminIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

const idSchema = z.object({ id: z.string().min(1) });
const activeStateSchema = z.object({ id: z.string().min(1), isActive: z.boolean() });

// ── Editing models ──────────────────────────────────────────

export const listEditingModels = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async () => {
    return ai.listEditingModels();
  });

export const getEditingModel = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(idSchema)
  .handler(async ({ data }) => {
    const model = await ai.getEditingModelWithFields(data.id);
    if (!model) throw new Error('Editing model not found');
    return model;
  });

export const getEditingModelFields = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(idSchema)
  .handler(async ({ data }) => {
    const model = await ai.getEditingModelWithFields(data.id);
    if (!model) throw new Error('Editing model not found');
    return { fields: model.fields };
  });

export const createEditingModel = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(createEditingModelSchema)
  .handler(async ({ data, context }) => {
    const adminId = adminIdFromCtx(context);
    const model = await ai.createEditingModel(
      {
        label: data.label,
        description: data.description || null,
        apiModelName: data.apiModelName,
        imageInputField: data.imageInputField,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
        createdBy: adminId,
        fields: data.fields,
      },
      adminId,
    );
    return { success: true, model };
  });

export const updateEditingModel = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(updateEditingModelSchema)
  .handler(async ({ data, context }) => {
    // Model row and whole field set are replaced in one transaction — a failed
    // update can no longer leave the model without fields.
    const model = await ai.updateEditingModel(
      {
        id: data.id,
        label: data.label,
        description: data.description || null,
        apiModelName: data.apiModelName,
        imageInputField: data.imageInputField,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
        fields: data.fields,
      },
      adminIdFromCtx(context),
    );
    return { success: true, model };
  });

export const setEditingModelActive = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(activeStateSchema)
  .handler(async ({ data, context }) => {
    const model = await ai.setEditingModelActive(data.id, data.isActive, adminIdFromCtx(context));
    return { success: true, model };
  });

export const deleteEditingModel = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(idSchema)
  .handler(async ({ data, context }) => {
    await ai.deleteEditingModel(data.id, adminIdFromCtx(context));
    return { success: true };
  });

// ── Generation models ───────────────────────────────────────

export const listGenerationModels = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async () => {
    return ai.listGenerationModels();
  });

export const getGenerationModel = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(idSchema)
  .handler(async ({ data }) => {
    const model = await ai.getGenerationModelWithFields(data.id);
    if (!model) throw new Error('Generation model not found');
    return model;
  });

export const createGenerationModel = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(createModelSchema)
  .handler(async ({ data, context }) => {
    const adminId = adminIdFromCtx(context);
    const model = await ai.createGenerationModel(
      {
        label: data.label,
        description: data.description || null,
        apiModelName: data.apiModelName,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
        createdBy: adminId,
        fields: data.fields,
      },
      adminId,
    );
    return { success: true, model };
  });

export const updateGenerationModel = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(updateModelSchema)
  .handler(async ({ data, context }) => {
    const model = await ai.updateGenerationModel(
      {
        id: data.id,
        label: data.label,
        description: data.description || null,
        apiModelName: data.apiModelName,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
        fields: data.fields,
      },
      adminIdFromCtx(context),
    );
    return { success: true, model };
  });

export const setGenerationModelActive = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(activeStateSchema)
  .handler(async ({ data, context }) => {
    const model = await ai.setGenerationModelActive(data.id, data.isActive, adminIdFromCtx(context));
    return { success: true, model };
  });

export const deleteGenerationModel = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(idSchema)
  .handler(async ({ data, context }) => {
    await ai.deleteGenerationModel(data.id, adminIdFromCtx(context));
    return { success: true };
  });
