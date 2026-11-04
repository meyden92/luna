import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getUserById } from '@/db/queries/admin';
import {
  deleteStudioBudgetOverride,
  getBudgetState,
  getStudioBudgetOverride,
  getStudioSettings,
  setStudioBudgetOverride,
  updateStudioSettings,
} from '@/db/queries/studio';
import {
  failedGenerations,
  failureRates,
  listBudgetOverrides,
  runningGenerations,
  spendByModel,
  spendByMonth,
  spendByUser,
} from '@/db/queries/studio-overview';
import { FalError } from '@/libs/fal/client';
import { budgetLimit, budgetState, utcMonthStart } from '@/libs/studio/budget';
import { assertStudioEnabled, falClient, hasFalBillingKey } from '@/libs/studio/config';
import { roundUsd } from '@/libs/studio/cost';
import { UserFacingError } from '@/libs/user-facing-error';
import { studioSettingsSchema, userStudioBudgetSchema } from '@/schemas/studio-schema';
import { userIdFromCtx as adminIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

/**
 * Admin cost control for the Studio: the settings, per-User Budgets and the
 * overview. Admin-only, refusing while the Studio is off. The overview never
 * carries a successful Generation's input or Outputs (see studio-overview.ts).
 */

const FAILURE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const FAILED_LIST_LIMIT = 50;

export const getStudioSettingsForAdmin = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async () => {
    assertStudioEnabled();
    const { defaultMonthlyBudgetUsd, maxActiveGenerationsPerUser } = await getStudioSettings();
    return { defaultMonthlyBudgetUsd, maxActiveGenerationsPerUser };
  });

export const saveStudioSettings = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(studioSettingsSchema)
  .handler(async ({ data, context }) => {
    assertStudioEnabled();
    await updateStudioSettings(data, adminIdFromCtx(context));
    return data;
  });

/** A User's Budget setting and this month's state, for their admin page. */
export const getUserStudioBudget = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(z.object({ userId: z.string().min(1) }))
  .handler(async ({ data }) => {
    assertStudioEnabled();
    const [override, settings, budget] = await Promise.all([
      getStudioBudgetOverride(data.userId),
      getStudioSettings(),
      getBudgetState(data.userId),
    ]);
    const setting = !override
      ? { mode: 'default' as const }
      : override.monthlyBudgetUsd === null
        ? { mode: 'unlimited' as const }
        : { mode: 'amount' as const, amountUsd: override.monthlyBudgetUsd };
    return { setting, defaultMonthlyBudgetUsd: settings.defaultMonthlyBudgetUsd, budget };
  });

export const setUserStudioBudget = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(userStudioBudgetSchema)
  .handler(async ({ data, context }) => {
    assertStudioEnabled();
    if (!(await getUserById(data.userId))) throw new UserFacingError('User not found.');
    const adminId = adminIdFromCtx(context);
    if (data.mode === 'default') await deleteStudioBudgetOverride(data.userId, adminId);
    else await setStudioBudgetOverride(data.userId, data.mode === 'amount' ? data.amountUsd : null, adminId);
    return { saved: true };
  });

/** fal's credit balance, or why it is unknown. */
async function falBalance(): Promise<{ usd: number; currency: string } | { error: string } | null> {
  if (!hasFalBillingKey()) return null;
  try {
    const { currentBalance, currency } = await falClient().platform.balance();
    return { usd: currentBalance, currency };
  } catch (error) {
    if (!(error instanceof FalError)) throw error;
    return { error: error.message };
  }
}

/**
 * Spend this month and over the last six calendar months (this one
 * included), per User and per Model, and the total of each of those months;
 * Budget usage this month; failure rates and failed Generations over 30
 * days; what is running; fal's balance.
 */
export const getStudioOverview = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async () => {
    assertStudioEnabled();
    const now = new Date();
    const monthStart = utcMonthStart(now);
    const sixMonthsStart = utcMonthStart(now, -5);
    const nextMonth = utcMonthStart(now, 1);
    const failureSince = new Date(now.getTime() - FAILURE_WINDOW_MS);

    const [monthByUser, monthByModel, sixByUser, sixByModel, sixByMonth, overrides, settings, rates, running, failed, balance] =
      await Promise.all([
        spendByUser(monthStart, nextMonth),
        spendByModel(monthStart, nextMonth),
        spendByUser(sixMonthsStart, nextMonth),
        spendByModel(sixMonthsStart, nextMonth),
        spendByMonth(sixMonthsStart, nextMonth),
        listBudgetOverrides(),
        getStudioSettings(),
        failureRates(failureSince),
        runningGenerations(),
        failedGenerations(failureSince, FAILED_LIST_LIMIT),
        falBalance(),
      ]);

    // Everyone who spent this month, and everyone with an own Budget.
    const budgetUsers = new Map(
      monthByUser.map((row) => [row.userId, { userId: row.userId, userName: row.userName, spentUsd: row.spentUsd }]),
    );
    for (const row of overrides) {
      if (!budgetUsers.has(row.userId)) budgetUsers.set(row.userId, { userId: row.userId, userName: row.userName, spentUsd: 0 });
    }
    const overrideByUser = new Map(overrides.map((row) => [row.userId, row]));
    const budgets = [...budgetUsers.values()]
      .map((row) => {
        const override = overrideByUser.get(row.userId);
        return {
          ...row,
          ...budgetState(budgetLimit(settings.defaultMonthlyBudgetUsd, override), row.spentUsd),
          own: Boolean(override),
        };
      })
      .sort((a, b) => b.spentUsd - a.spentUsd || a.userName.localeCompare(b.userName));

    const total = (rows: { spentUsd: number }[]) => roundUsd(rows.reduce((sum, row) => sum + row.spentUsd, 0));
    // Newest first, with the months nothing was spent in.
    const spentByMonth = new Map(sixByMonth.map((row) => [row.month, row]));
    const byMonth = [0, -1, -2, -3, -4, -5].map((offset) => {
      const start = utcMonthStart(now, offset).toISOString();
      const row = spentByMonth.get(start.slice(0, 7));
      return { monthStart: start, spentUsd: row?.spentUsd ?? 0, generations: row?.generations ?? 0 };
    });
    return {
      monthStart: monthStart.toISOString(),
      sixMonthsStart: sixMonthsStart.toISOString(),
      defaultMonthlyBudgetUsd: settings.defaultMonthlyBudgetUsd,
      spend: {
        month: { totalUsd: total(monthByUser), byUser: monthByUser, byModel: monthByModel },
        sixMonths: { totalUsd: total(sixByUser), byUser: sixByUser, byModel: sixByModel },
        byMonth,
      },
      budgets,
      failureRates: rates,
      running: running.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), startedAt: row.startedAt?.toISOString() ?? null })),
      failed: failed.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      balance,
    };
  });
