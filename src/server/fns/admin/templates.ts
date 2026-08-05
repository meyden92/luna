import type { Prisma } from '@db/client';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import prisma from '@/libs/prismadb';
import { deleteTemplateImages, uploadTemplateImages } from '@/libs/template-upload';
import { templateFormSchema } from '@/schemas/template-schema';
import { userIdFromCtx as adminIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

interface TemplateInput {
  name: string;
  description?: string | null;
  prompt: string;
  editingModelId: string;
  isActive: boolean;
  minImageCount?: number;
  maxImageCount?: number;
  inputImageCount?: number;
  variables: Array<{
    globalVariableId?: string;
    type?: string;
    options?: { value: string; label?: string }[];
    required?: boolean;
    [k: string]: unknown;
  }>;
  editingModelFieldValues?: Record<string, unknown>;
  previewImageBase64?: string;
  previewImageName?: string;
  previewImageMimeType?: string;
  previewImageUrl?: string;
}

const templateInputSchema: z.ZodType<TemplateInput> = z
  .object({
    name: z.string().min(1),
    description: z.string().nullable().optional(),
    prompt: z.string().min(1),
    editingModelId: z.string().min(1),
    isActive: z.boolean(),
    minImageCount: z.number().int().min(0).optional(),
    maxImageCount: z.number().int().min(0).optional(),
    inputImageCount: z.number().int().min(0).optional(),
    variables: z.array(z.unknown()).default([]),
    editingModelFieldValues: z.record(z.string(), z.unknown()).optional(),
    previewImageBase64: z.string().optional(),
    previewImageName: z.string().optional(),
    previewImageMimeType: z.string().optional(),
    previewImageUrl: z.string().optional(),
  })
  .passthrough() as unknown as z.ZodType<TemplateInput>;

const editingModelFieldValuesJson = (value: Record<string, unknown> | undefined): Prisma.InputJsonValue =>
  (value ?? {}) as Prisma.InputJsonValue;

async function decodePreviewImage(input: TemplateInput): Promise<File | null> {
  if (!input.previewImageBase64 || !input.previewImageName) return null;
  const bytes = Buffer.from(input.previewImageBase64, 'base64');
  return new File([bytes], input.previewImageName, { type: input.previewImageMimeType ?? 'application/octet-stream' });
}

function partitionVariables(allVariables: TemplateInput['variables']) {
  const local = allVariables.filter((v) => !v.globalVariableId);
  const links = allVariables.filter((v) => v.globalVariableId);
  return { local, links };
}

async function buildGlobalVariableLinks(links: TemplateInput['variables']) {
  if (links.length === 0) return [];
  const ids = links.map((v) => v.globalVariableId!).filter(Boolean);
  const globals = await prisma.globalVariable.findMany({ where: { id: { in: ids } } });
  const map = new Map(globals.map((g) => [g.id, g]));

  return links
    .map((link) => {
      const g = map.get(link.globalVariableId!);
      if (!g) return null;
      let added: Array<{ value: string; label?: string }> = [];
      if (link.type === 'dropdown' && link.options && g.options) {
        const existing = new Set((g.options as Array<{ value: string }>).map((o) => o.value));
        added = link.options.filter((o) => !existing.has(o.value));
      }
      return {
        globalVariableId: link.globalVariableId!,
        addedOptions: added.length > 0 ? added : undefined,
        required: link.required ?? false,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);
}

export const listAdminTemplates = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async () => {
    return prisma.template.findMany({
      include: {
        globalVariables: true,
        createdByUser: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  });

export const getTemplateFormData = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async () => {
    const [editingModels, globalVariables] = await Promise.all([
      prisma.editingModel.findMany({
        where: { isActive: true },
        include: { fields: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.globalVariable.findMany({ orderBy: { name: 'asc' } }),
    ]);
    return { editingModels, globalVariables };
  });

export const getAdminTemplateForEdit = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const [template, editingModels, globalVariables] = await Promise.all([
      prisma.template.findUnique({
        where: { id: data.id },
        include: {
          globalVariables: {
            include: { globalVariable: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
      }),
      prisma.editingModel.findMany({
        where: { isActive: true },
        include: { fields: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.globalVariable.findMany({ orderBy: { name: 'asc' } }),
    ]);
    if (!template) throw new Error('Template not found');
    return { template, editingModels, globalVariables };
  });

export const getAdminTemplate = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const template = await prisma.template.findUnique({
      where: { id: data.id },
      include: { globalVariables: true },
    });
    if (!template) throw new Error('Template not found');
    return template;
  });

export const createAdminTemplate = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(templateInputSchema)
  .handler(async ({ data, context }) => {
    const validation = templateFormSchema.safeParse(data);
    if (!validation.success) {
      return { validationErrors: validation.error.flatten().fieldErrors };
    }
    const validData = validation.data;
    const { local, links } = partitionVariables(validData.variables);
    const linkCreate = await buildGlobalVariableLinks(links);

    let previewImageUrl: string | null = null;
    const file = await decodePreviewImage(data);
    if (file) {
      const urls = await uploadTemplateImages([file], validData.name);
      previewImageUrl = urls[0] || null;
    }

    try {
      const template = await prisma.template.create({
        data: {
          name: validData.name,
          description: validData.description || null,
          prompt: validData.prompt,
          editingModelId: validData.editingModelId,
          isActive: validData.isActive,
          minImageCount: validData.minImageCount,
          maxImageCount: validData.maxImageCount,
          variables: local as any,
          globalVariables: { create: linkCreate },
          previewImages: previewImageUrl ? JSON.stringify([previewImageUrl]) : null,
          createdBy: adminIdFromCtx(context),
          inputImageCount: validData.inputImageCount,
          editingModelFieldValues: editingModelFieldValuesJson(validData.editingModelFieldValues),
        },
      });
      return { success: true, templateId: template.id };
    } catch (e) {
      console.error('Failed to create template:', e);
      return { serverError: 'Failed to create template in database' };
    }
  });

export const updateAdminTemplate = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(templateInputSchema.and(z.object({ id: z.string().min(1) })))
  .handler(async ({ data }) => {
    const existing = await prisma.template.findUnique({ where: { id: data.id } });
    if (!existing) throw new Error('Template not found');

    const validation = templateFormSchema.safeParse(data);
    if (!validation.success) {
      return { validationErrors: validation.error.flatten().fieldErrors };
    }
    const validData = validation.data;
    const { local, links } = partitionVariables(validData.variables);
    const linkCreate = await buildGlobalVariableLinks(links);

    let previewImageUrl: string | null = null;
    let existingPreview: string | null = null;
    let uploadedNew = false;

    if (existing.previewImages) {
      try {
        const parsed = JSON.parse(existing.previewImages);
        existingPreview = Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : null;
      } catch {
        existingPreview = null;
      }
    }

    const file = await decodePreviewImage(data);
    if (file) {
      const urls = await uploadTemplateImages([file], validData.name);
      previewImageUrl = urls[0] || null;
      uploadedNew = true;
    } else if (data.previewImageUrl) {
      previewImageUrl = data.previewImageUrl;
    } else if (existingPreview) {
      previewImageUrl = existingPreview;
    }

    try {
      const template = await prisma.template.update({
        where: { id: data.id },
        data: {
          name: validData.name,
          description: validData.description || null,
          prompt: validData.prompt,
          editingModelId: validData.editingModelId,
          isActive: validData.isActive,
          minImageCount: validData.minImageCount,
          maxImageCount: validData.maxImageCount,
          variables: local as any,
          globalVariables: { deleteMany: {}, create: linkCreate },
          previewImages: previewImageUrl ? JSON.stringify([previewImageUrl]) : null,
          inputImageCount: validData.inputImageCount,
          editingModelFieldValues: editingModelFieldValuesJson(validData.editingModelFieldValues),
        },
      });

      if (uploadedNew && existingPreview && existingPreview !== previewImageUrl) {
        try {
          await deleteTemplateImages([existingPreview]);
        } catch (e) {
          console.error('Failed to clean up previous preview image:', e);
        }
      }
      return { success: true, templateId: template.id };
    } catch (e) {
      if (uploadedNew && previewImageUrl) {
        try {
          await deleteTemplateImages([previewImageUrl]);
        } catch (cleanup) {
          console.error('Cleanup failed:', cleanup);
        }
      }
      console.error('Failed to update template:', e);
      return { serverError: 'Failed to update template in database' };
    }
  });

export const deleteAdminTemplate = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const template = await prisma.template.findUnique({ where: { id: data.id } });
    if (!template) throw new Error('Template not found');
    if (template.previewImages) {
      const urls = JSON.parse(template.previewImages as string) as string[];
      await deleteTemplateImages(urls);
    }
    await prisma.template.delete({ where: { id: data.id } });
    return { success: true };
  });
