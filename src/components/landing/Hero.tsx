import { Link } from '@tanstack/react-router';
import { ArrowRight, CoffeeIcon, Eye, HeartIcon, Image as ImageIcon, Rocket } from 'lucide-react';

export default function Hero() {
  return (
    <section className="luna-corner-ticks relative px-9 py-[60px_40px] mx-auto max-w-[1280px]">
      <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-luna-line bg-luna-bg py-[5px] pl-2 pr-[10px] text-[11.5px] text-luna-ink-2">
            <span className="luna-pulse-dot h-1.5 w-1.5 rounded-full" />
            Built with passion
          </span>

          <h1 className="luna-rise font-serif my-[22px_18px] text-[clamp(56px,7vw,104px)] font-normal leading-[0.96] tracking-[-0.02em] text-luna-ink">
            <span className="block overflow-hidden">
              <span>Share</span>
            </span>
            <span className="block overflow-hidden">
              <span className="luna-accent-highlight italic text-luna-accent-2">Simply</span>
            </span>
            <span className="block overflow-hidden">
              <span>Better</span>
            </span>
          </h1>

          <p className="max-w-[48ch] text-[16.5px] leading-[1.55] text-luna-ink-2">
            A file sharing platform that actually respects you. No ads, no tracking, no BS. Just simple, fast file sharing the way it should
            be.
          </p>

          <div className="my-[22px_26px] flex flex-wrap gap-x-2.5 gap-y-2">
            <Chip icon={<HeartIcon size={14} />}>Made with Love</Chip>
            <Chip icon={<CoffeeIcon size={14} />}>Caffeine Powered</Chip>
            <Chip icon={<Rocket size={14} />}>ShareX Integration</Chip>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 rounded-[10px] bg-luna-accent px-[18px] py-2.5 text-[13.5px] font-medium text-[oklch(0.15_0.03_162)] transition-all hover:-translate-y-px hover:shadow-[0_10px_24px_-10px_color-mix(in_oklab,var(--luna-accent)_55%,transparent)]"
            >
              Start Creating Now <ArrowRight size={14} />
            </Link>
            <a
              href="#showcase"
              className="inline-flex items-center gap-2 rounded-[10px] border border-luna-line bg-luna-bg px-[18px] py-2.5 text-[13.5px] font-medium text-luna-ink transition-all hover:bg-luna-bg-2"
            >
              <Eye size={14} /> Watch demo
            </a>
            <div className="ml-auto flex items-center gap-2.5 text-xs text-luna-ink-3">
              <Avastack letters={['M', 'A', 'R', '+']} />
              <span>Trusted by quiet uploaders</span>
            </div>
          </div>
        </div>

        <HeroStage />
      </div>
    </section>
  );
}

function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-luna-line bg-luna-bg px-3 py-[7px] text-[12.5px] text-luna-ink-2 transition-all hover:-translate-y-px hover:border-luna-line-2 [&>svg]:text-luna-accent-2">
      {icon}
      {children}
    </span>
  );
}

function Avastack({ letters }: { letters: string[] }) {
  const styles = [
    { background: '#FDE68A', color: '#713F12' },
    { background: '#A7F3D0', color: '#064E3B' },
    { background: '#DDD6FE', color: '#4C1D95' },
    { background: '#FECACA', color: '#7F1D1D' },
  ];
  return (
    <span className="flex">
      {letters.map((l, i) => (
        <span
          key={l}
          className="-ml-1.5 inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-luna-bg text-[10px] font-semibold first:ml-0"
          style={styles[i % styles.length]}
        >
          {l}
        </span>
      ))}
    </span>
  );
}

function HeroStage() {
  return (
    <div className="relative hidden h-[520px] lg:block">
      <div
        className="absolute inset-[8%] -z-0"
        style={{
          background: 'radial-gradient(closest-side, color-mix(in oklab, var(--luna-accent) 22%, transparent), transparent 70%)',
          filter: 'blur(34px)',
        }}
      />

      <div className="luna-float-1 absolute inset-0 overflow-hidden rounded-[20px] border border-luna-line shadow-[0_30px_60px_-30px_rgba(15,21,17,0.22),0_10px_20px_-10px_rgba(15,21,17,0.1)]">
        <img
          src="/decor/hero-scene-light.webp"
          alt="Files drifting up toward a glowing crescent moon"
          className="h-full w-full object-cover dark:hidden"
        />
        <img
          src="/decor/hero-scene.webp"
          alt="Files drifting up toward a glowing crescent moon"
          className="hidden h-full w-full object-cover dark:block"
        />
      </div>

      <div className="luna-float-2 absolute bottom-5 left-4 z-[5] w-[250px] overflow-hidden rounded-[14px] border border-luna-line bg-luna-bg/92 shadow-[0_30px_60px_-30px_rgba(15,21,17,0.22),0_10px_20px_-10px_rgba(15,21,17,0.1)] backdrop-blur-md">
        <div className="flex items-center gap-2.5 px-3.5 py-3">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-luna-accent-2"
            style={{ background: 'color-mix(in oklab, var(--luna-accent) 16%, var(--luna-bg))' }}
          >
            <ImageIcon size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium text-luna-ink">screenshot_2026-04-21.png</div>
            <div className="mt-0.5 font-mono text-[11px] text-luna-ink-3">2.4 MB · shared</div>
          </div>
          <ArrowRight
            size={15}
            className="text-luna-accent-2"
          />
        </div>
        <div className="relative mx-3.5 mb-3 h-1 overflow-hidden rounded-full bg-luna-bg-3">
          <i className="luna-prog-indefinite absolute inset-y-0 left-0 w-[42%] rounded-full bg-gradient-to-r from-luna-accent-2 to-luna-accent" />
        </div>
      </div>

      <div className="luna-float-3 absolute right-4 top-6 z-[5] flex items-center gap-2 rounded-full border border-luna-line bg-luna-bg/92 px-3 py-1.5 shadow-[0_10px_20px_-10px_rgba(15,21,17,0.2)] backdrop-blur-md">
        <span className="luna-pulse-dot h-1.5 w-1.5 rounded-full" />
        <span className="text-[11.5px] font-medium text-luna-ink">No ads · No tracking</span>
      </div>
    </div>
  );
}
