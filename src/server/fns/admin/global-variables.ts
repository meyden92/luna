import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import * as ai from '@/db/queries/ai';
import type { JsonValue } from '@/db/schema/json';
import { globalVariableFormSchema } from '@/schemas/admin/global-variable-schema';
import { userIdFromCtx as adminIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

const asJson = (options: unknown): JsonValue | undefined =>
  options === undefined ? undefined : (JSON.parse(JSON.stringify(options)) as JsonValue);

export const listGlobalVariables = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async () => {
    return ai.listGlobalVariables();
  });

export const listGlobalVariablesWithUsage = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async () => {
    return ai.listGlobalVariablesWithUsage();
  });

export const getGlobalVariable = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const variable = await ai.getGlobalVariable(data.id);
    if (!variable) throw new Error('Global variable not found');
    return variable;
  });

export const createGlobalVariable = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(globalVariableFormSchema)
  .handler(async ({ data, context }) => {
    // The duplicate check is case-insensitive because MariaDB's collation made
    // it so and the form never asked for case to be significant (issue #23).
    if (await ai.globalVariableNameTaken(data.name)) throw new Error('A global variable with this name already exists.');

    await ai.createGlobalVariable(
      {
        name: data.name,
        label: data.label,
        type: data.type,
        description: data.description,
        defaultValue: data.defaultValue,
        options: asJson(data.options),
        required: data.required || false,
      },
      adminIdFromCtx(context),
    );
    return { success: true };
  });

export const updateGlobalVariable = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(globalVariableFormSchema.and(z.object({ id: z.string().min(1) })))
  .handler(async ({ data, context }) => {
    if (await ai.globalVariableNameTaken(data.name, data.id)) throw new Error('A global variable with this name already exists.');

    await ai.updateGlobalVariable(
      {
        id: data.id,
        name: data.name,
        label: data.label,
        type: data.type,
        description: data.description,
        defaultValue: data.defaultValue,
        options: asJson(data.options),
        required: data.required || false,
      },
      adminIdFromCtx(context),
    );
    return { success: true };
  });

export const deleteGlobalVariable = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    await ai.deleteGlobalVariable(data.id, adminIdFromCtx(context));
    return { success: true };
  });
