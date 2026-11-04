import { formatDistanceStrict } from 'date-fns';

/** "$0.03 / image", as fal states a unit price. */
export function formatPrice(price: { unitPrice: number; unit: string; currency: string }): string {
  const amount = price.currency === 'USD' ? `$${price.unitPrice}` : `${price.unitPrice} ${price.currency}`;
  return `${amount} / ${price.unit}`;
}

/** "num_images" -> "Num images": the label of a Field or Variable the admin left unlabelled. */
export function humanize(name: string): string {
  const words = name.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "1 Model", "2 Models". */
export function countOf(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** "0.03 $", "12.40 $", "20 $"; fractions of a cent keep up to four digits. */
export function formatUsd(amount: number): string {
  return `${usdAmount(amount)} $`;
}

function usdAmount(amount: number): string {
  const digits = Number.isInteger(amount) ? 0 : 2;
  return amount.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: Math.max(digits, 4), useGrouping: false });
}

/** "12.40 of 20 $" for this month's spend, or "No Budget limit". */
export function budgetLabel(budget: { limitUsd: number | null; spentUsd: number }): string {
  if (budget.limitUsd === null) return 'No Budget limit';
  return `${usdAmount(budget.spentUsd)} of ${formatUsd(budget.limitUsd)}`;
}

/**
 * A history entry's expiry: "expires in 6 days" while an unsaved Output is
 * left, "Output expired" once only expired ones are, null when all are saved.
 */
export function expiryLabel(
  outputs: { expiresAt: string; expiredAt: string | null; savedFileId: string | null }[],
  now: Date = new Date(),
): string | null {
  const unsaved = outputs.filter((output) => !output.savedFileId);
  const live = unsaved.filter((output) => !output.expiredAt && new Date(output.expiresAt) > now);
  if (live.length > 0) {
    const first = Math.min(...live.map((output) => new Date(output.expiresAt).getTime()));
    return `expires in ${formatDistanceStrict(first, now)}`;
  }
  return unsaved.length > 0 ? 'Output expired' : null;
}
