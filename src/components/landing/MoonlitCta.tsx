import { Link } from '@tanstack/react-router';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { NightBandBackdrop } from '@/components/landing/NightBandBackdrop';

export default function MoonlitCta() {
  return (
    <section className="relative mx-auto max-w-[1280px] px-9 py-[40px]">
      <div className="relative overflow-hidden rounded-[20px] border border-luna-line bg-luna-bg-2">
        <NightBandBackdrop />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-luna-bg-2 via-luna-bg-2/85 to-transparent" />

        <div className="relative grid items-center gap-8 p-[36px_28px] md:p-[52px_48px] lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <span className="font-mono text-[11px] tracking-[0.12em] text-luna-accent-2 dark:text-luna-accent">READY WHEN YOU ARE</span>
            <h2 className="mt-3 font-serif text-[clamp(34px,4.4vw,52px)] font-normal leading-[1.02] tracking-[-0.02em] text-luna-ink">
              Share simply,
              <br />
              <em className="italic text-luna-accent-2 dark:text-luna-accent">sleep easy</em>.
            </h2>
            <p className="mt-4 max-w-[46ch] text-[14.5px] leading-[1.6] text-luna-ink-3">
              Your files, sent quietly into the night — no ads, no tracking, no one peering over your shoulder. Just fast, honest sharing.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 rounded-[10px] bg-luna-accent px-[18px] py-2.5 text-[13.5px] font-medium text-[oklch(0.15_0.03_162)] transition-all hover:-translate-y-px hover:shadow-[0_10px_24px_-10px_color-mix(in_oklab,var(--luna-accent)_55%,transparent)]"
              >
                Start Creating Now <ArrowRight size={14} />
              </Link>
              <span className="inline-flex items-center gap-2 text-[12.5px] text-luna-ink-3">
                <ShieldCheck
                  size={14}
                  className="text-luna-accent-2 dark:text-luna-accent"
                />
                End-to-end encrypted
              </span>
            </div>
          </div>

          <div className="relative hidden justify-self-center lg:block">
            <div
              className="absolute inset-[14%] -z-0"
              style={{
                background: 'radial-gradient(closest-side, color-mix(in oklab, var(--luna-accent) 24%, transparent), transparent 70%)',
                filter: 'blur(34px)',
              }}
            />
            <img
              src="/decor/share-orbit-light.webp"
              alt="Photos, documents, video and audio files orbiting the LunaShare moon"
              className="luna-float-2 relative w-[340px] max-w-full rounded-[20px] border border-luna-line shadow-[0_30px_60px_-30px_rgba(15,21,17,0.22),0_10px_20px_-10px_rgba(15,21,17,0.1)] dark:hidden"
            />
            <img
              src="/decor/share-orbit.webp"
              alt="Photos, documents, video and audio files orbiting the LunaShare moon"
              className="luna-float-2 relative hidden w-[340px] max-w-full rounded-[20px] border border-luna-line shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)] dark:block"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
