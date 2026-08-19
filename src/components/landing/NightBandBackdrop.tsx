/**
 * Decorative night-sky band, in its light and dark variants. Fills the nearest
 * positioned ancestor; callers layer their own gradient scrim on top.
 */
export function NightBandBackdrop() {
  return (
    <>
      <img
        src="/decor/night-band-light.webp"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-70 dark:hidden"
      />
      <img
        src="/decor/night-band.webp"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden h-full w-full object-cover opacity-50 dark:block"
      />
    </>
  );
}
