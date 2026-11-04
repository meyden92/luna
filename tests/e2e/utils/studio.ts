import { randomUUID } from 'node:crypto';
import { expect, type Locator, type Page } from '@playwright/test';
import { studioCategory, studioModel } from '../../../src/db/schema/studio';
import { defaultFieldConfigs, suggestPricing } from '../../../src/libs/studio/model-config';
import { resolveOpenapiSchemas } from '../../../src/libs/studio/openapi';
import type { FieldConfig } from '../../../src/libs/studio/types';
import type { TestDb } from '../fixtures/db';
import type { StackEnv } from '../stack-env';
import { falFakeClient } from './fal-fake';
import { untilHydrated } from './hydration';
import { uniquePrefix } from './own-files';

/**
 * Spec helpers for the Studio screen. Categories and Models are global, so a
 * spec seeds its own with `uniquePrefix` names and finds history entries by
 * their Model's name.
 */

export interface SeededModel {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
}

/**
 * Seeds a Category holding one active Model of a fake endpoint, configured
 * as `addStudioModel` configures a new one (fal's schema and price, default
 * Field cards); `fields` may adjust the cards.
 */
export async function seedStudioModel(
  db: TestDb,
  stack: StackEnv,
  options: { label: string; endpointId: string; icon?: string; fields?: (defaults: FieldConfig[]) => FieldConfig[] },
): Promise<SeededModel> {
  const fal = falFakeClient(stack);
  const [found] = (await fal.platform.models({ endpointIds: [options.endpointId], expandOpenapi: true })).models;
  if (!found?.openapi) throw new Error(`The fake does not serve ${options.endpointId}`);
  const schemaSnapshot = resolveOpenapiSchemas(found.openapi, options.endpointId);
  const [price] = await fal.platform.pricing([options.endpointId]);
  const defaults = defaultFieldConfigs(schemaSnapshot.input);

  const categoryName = uniquePrefix(`${options.label} category`);
  const name = uniquePrefix(options.label);
  const categoryId = randomUUID();
  const id = randomUUID();
  await db.insert(studioCategory).values({ id: categoryId, name: categoryName, icon: options.icon ?? 'Image' });
  await db.insert(studioModel).values({
    id,
    categoryId,
    endpointId: options.endpointId,
    name,
    schemaSnapshot,
    schemaCheckedAt: new Date(),
    fields: options.fields ? options.fields(defaults) : defaults,
    pricing: price ? suggestPricing(price, schemaSnapshot.input) : null,
  });
  return { id, name, categoryId, categoryName };
}

/** Opens the Studio on a Model and waits until its form takes input. */
export async function openStudio(page: Page, model: SeededModel): Promise<void> {
  await page.goto(`/studio?category=${model.categoryId}&model=${model.id}`);
  await expect(page.getByRole('heading', { name: model.name })).toBeVisible();
  await untilHydrated(page.getByRole('button', { name: 'Generate' }));
}

/** The newest history entry of a Model. */
export const historyEntry = (page: Page, model: SeededModel): Locator =>
  page.getByRole('region', { name: 'History' }).getByRole('article', { name: model.name }).first();
