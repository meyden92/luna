import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import prisma from '@/libs/prismadb';
import { globalVariableFormSchema } from '@/schemas/admin/global-variable-schema';
import { appMiddleware } from '@/server/server-fn';

export const listGlobalVariables = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async () => {
    return prisma.globalVariable.findMany({ orderBy: { name: 'asc' } });
  });

export const listGlobalVariablesWithUsage = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async () => {
    return prisma.globalVariable.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { templates: true } } },
    });
  });

export const getGlobalVariable = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const variable = await prisma.globalVariable.findUnique({ where: { id: data.id } });
    if (!variable) throw new Error('Global variable not found');
    return variable;
  });

export const createGlobalVariable = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(globalVariableFormSchema)
  .handler(async ({ data }) => {
    const existing = await prisma.globalVariable.findUnique({ where: { name: data.name } });
    if (existing) throw new Error('A global variable with this name already exists.');

    await prisma.globalVariable.create({
      data: {
        name: data.name,
        label: data.label,
        type: data.type,
        description: data.description,
        defaultValue: data.defaultValue,
        options: data.options ? JSON.parse(JSON.stringify(data.options)) : undefined,
        required: data.required || false,
      },
    });
    return { success: true };
  });

export const updateGlobalVariable = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(globalVariableFormSchema.and(z.object({ id: z.string().min(1) })))
  .handler(async ({ data }) => {
    const existing = await prisma.globalVariable.findFirst({
      where: { name: data.name, NOT: { id: data.id } },
    });
    if (existing) throw new Error('A global variable with this name already exists.');

    await prisma.globalVariable.update({
      where: { id: data.id },
      data: {
        name: data.name,
        label: data.label,
        type: data.type,
        description: data.description,
        defaultValue: data.defaultValue,
        options: data.options ? JSON.parse(JSON.stringify(data.options)) : undefined,
        required: data.required || false,
      },
    });
    return { success: true };
  });

export const deleteGlobalVariable = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    await prisma.globalVariable.delete({ where: { id: data.id } });
    return { success: true };
  });
