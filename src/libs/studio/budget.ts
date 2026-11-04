import { roundUsd } from './cost';
import { formatUsd } from './format';

/**
 * Budget arithmetic: the UTC calendar month a Budget covers, which limit
 * applies to a User and whether an estimate still fits. Pure, so the Studio
 * screen and the admin pages may import it too.
 */

export interface BudgetState {
  /** Null means unlimited. */
  limitUsd: number | null;
  spentUsd: number;
  /** Null when the limit is. */
  remainingUsd: number | null;
}

/** Midnight UTC on the first of `date`'s month, moved by `offsetMonths`. */
export function utcMonthStart(date: Date, offsetMonths = 0): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offsetMonths, 1));
}

/** The User's monthly limit: their override when they have one, else the default. Null means unlimited. */
export function budgetLimit(defaultUsd: number | null, override: { monthlyBudgetUsd: number | null } | undefined): number | null {
  return override ? override.monthlyBudgetUsd : defaultUsd;
}

// Amounts are rounded to the micro-dollar before they are compared, so 0.06 + 0.03 fits 0.09.
export function budgetState(limitUsd: number | null, spentUsd: number): BudgetState {
  if (limitUsd === null) return { limitUsd, spentUsd, remainingUsd: null };
  return { limitUsd, spentUsd, remainingUsd: Math.max(0, roundUsd(limitUsd - spentUsd)) };
}

/**
 * Why a Generation estimated at `estimateUsd` may not start, or null when it
 * may. A Model without a price is let through until nothing is left.
 */
export function budgetRefusal(budget: BudgetState, estimateUsd: number | null): string | null {
  if (budget.limitUsd === null || budget.remainingUsd === null) return null;
  if (estimateUsd === null) return budget.remainingUsd > 0 ? null : `Your monthly Budget of ${formatUsd(budget.limitUsd)} is used up.`;
  if (roundUsd(estimateUsd) <= roundUsd(budget.remainingUsd)) return null;
  return `This would cost about ${formatUsd(estimateUsd)}, but only ${formatUsd(budget.remainingUsd)} of your monthly Budget is left.`;
}
