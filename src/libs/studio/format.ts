/** "$0.03 / image", as fal states a unit price. */
export function formatPrice(price: { unitPrice: number; unit: string; currency: string }): string {
  const amount = price.currency === 'USD' ? `$${price.unitPrice}` : `${price.unitPrice} ${price.currency}`;
  return `${amount} / ${price.unit}`;
}

/** "1 Model", "2 Models". */
export function countOf(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
