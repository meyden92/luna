import { cn } from '@/libs/utils';
import styles from './NightBandBackdrop.module.css';

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
        className={cn(styles.band, styles.dayImage)}
      />
      <img
        src="/decor/night-band.webp"
        alt=""
        aria-hidden="true"
        className={cn(styles.band, styles.nightImage)}
      />
    </>
  );
}
