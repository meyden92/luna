/**
 * Resolves a colour custom property (`--chart-1`, `--foreground`) to the concrete
 * colour the browser would paint. Reading the property directly returns the raw
 * `light-dark(...)` expression from the token file, which canvas and SVG code
 * cannot parse; painting it through a probe element resolves the Appearance.
 */
export function resolveCssColor(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const probe = document.createElement('span');
  probe.style.color = `var(${name})`;
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value || fallback;
}
