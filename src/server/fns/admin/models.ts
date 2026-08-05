import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import prisma from '@/libs/prismadb';
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
    return prisma.editingModel.findMany({
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  });

export const getEditingModel = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(idSchema)
  .handler(async ({ data }) => {
    const model = await prisma.editingModel.findUnique({
      where: { id: data.id },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!model) throw new Error('Editing model not found');
    return model;
  });

export const getEditingModelFields = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(idSchema)
  .handler(async ({ data }) => {
    const model = await prisma.editingModel.findUnique({
      where: { id: data.id },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!model) throw new Error('Editing model not found');
    return { fields: model.fields };
  });

export const createEditingModel = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(createEditingModelSchema)
  .handler(async ({ data, context }) => {
    const model = await prisma.editingModel.create({
      data: {
        label: data.label,
        description: data.description || null,
        apiModelName: data.apiModelName,
        imageInputField: data.imageInputField,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
        createdBy: adminIdFromCtx(context),
        fields: { create: data.fields },
      },
      include: { fields: true },
    });
    return { success: true, model };
  });

export const updateEditingModel = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(updateEditingModelSchema)
  .handler(async ({ data }) => {
    const model = await prisma.editingModel.update({
      where: { id: data.id },
      data: {
        label: data.label,
        description: data.description || null,
        apiModelName: data.apiModelName,
        imageInputField: data.imageInputField,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
        // Nested deleteMany + create runs in one transaction — a failed
        // update can no longer leave the model without fields.
        fields: { deleteMany: {}, create: data.fields },
      },
      include: { fields: true },
    });
    return { success: true, model };
  });

export const setEditingModelActive = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(activeStateSchema)
  .handler(async ({ data }) => {
    const model = await prisma.editingModel.update({
      where: { id: data.id },
      data: { isActive: data.isActive },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });
    return { success: true, model };
  });

export const deleteEditingModel = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(idSchema)
  .handler(async ({ data }) => {
    await prisma.editingModel.delete({ where: { id: data.id } });
    return { success: true };
  });

// ── Generation models ───────────────────────────────────────

export const listGenerationModels = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async () => {
    return prisma.generationModel.findMany({
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  });

export const getGenerationModel = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(idSchema)
  .handler(async ({ data }) => {
    const model = await prisma.generationModel.findUnique({
      where: { id: data.id },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!model) throw new Error('Generation model not found');
    return model;
  });

export const createGenerationModel = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(createModelSchema)
  .handler(async ({ data, context }) => {
    const model = await prisma.generationModel.create({
      data: {
        label: data.label,
        description: data.description || null,
        apiModelName: data.apiModelName,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
        createdBy: adminIdFromCtx(context),
        fields: { create: data.fields },
      },
      include: { fields: true },
    });
    return { success: true, model };
  });

export const updateGenerationModel = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(updateModelSchema)
  .handler(async ({ data }) => {
    const model = await prisma.generationModel.update({
      where: { id: data.id },
      data: {
        label: data.label,
        description: data.description || null,
        apiModelName: data.apiModelName,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
        fields: { deleteMany: {}, create: data.fields },
      },
      include: { fields: true },
    });
    return { success: true, model };
  });

export const setGenerationModelActive = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(activeStateSchema)
  .handler(async ({ data }) => {
    const model = await prisma.generationModel.update({
      where: { id: data.id },
      data: { isActive: data.isActive },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });
    return { success: true, model };
  });

export const deleteGenerationModel = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(idSchema)
  .handler(async ({ data }) => {
    await prisma.generationModel.delete({ where: { id: data.id } });
    return { success: true };
  });
