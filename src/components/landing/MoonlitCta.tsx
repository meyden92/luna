import { Link } from '@tanstack/react-router';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { NightBandBackdrop } from '@/components/landing/NightBandBackdrop';
import { cn } from '@/libs/utils';
import styles from './MoonlitCta.module.css';

export default function MoonlitCta() {
  return (
    <section className={styles.root}>
      <div className={styles.panel}>
        <NightBandBackdrop />
        <div className={styles.scrim} />

        <div className={styles.body}>
          <div>
            <span className={styles.eyebrow}>READY WHEN YOU ARE</span>
            <h2 className={styles.headline}>
              Share simply,
              <br />
              <em className={styles.emphasis}>sleep easy</em>.
            </h2>
            <p className={styles.blurb}>
              Your files, sent quietly into the night — no ads, no tracking, no one peering over your shoulder. Just fast, honest sharing.
            </p>
            <div className={styles.actions}>
              <Link
                to="/dashboard"
                className={styles.cta}
              >
                Start Creating Now <ArrowRight size={14} />
              </Link>
              <span className={styles.assurance}>
                <ShieldCheck
                  size={14}
                  className={styles.assuranceIcon}
                />
                End-to-end encrypted
              </span>
            </div>
          </div>

          <div className={styles.art}>
            <div className={styles.glow} />
            <img
              src="/decor/share-orbit-light.webp"
              alt="Photos, documents, video and audio files orbiting the LunaShare moon"
              className={cn(styles.orbit, styles.orbitLight)}
            />
            <img
              src="/decor/share-orbit.webp"
              alt="Photos, documents, video and audio files orbiting the LunaShare moon"
              className={cn(styles.orbit, styles.orbitDark)}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
