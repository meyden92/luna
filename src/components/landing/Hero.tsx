import { Link } from '@tanstack/react-router';
import { ArrowRight, CoffeeIcon, Eye, HeartIcon, Image as ImageIcon, Rocket } from 'lucide-react';
import { cn } from '@/libs/utils';
import heroStyles from './Hero.module.css';

export default function Hero() {
  return (
    <section className={heroStyles.root}>
      <div className={heroStyles.grid}>
        <div>
          <span className={heroStyles.badge}>
            <span className={heroStyles.dot} />
            Built with passion
          </span>

          <h1 className={heroStyles.headline}>
            <span className={heroStyles.line}>
              <span>Share</span>
            </span>
            <span className={heroStyles.line}>
              <span className={heroStyles.highlight}>Simply</span>
            </span>
            <span className={heroStyles.line}>
              <span>Better</span>
            </span>
          </h1>

          <p className={heroStyles.lede}>
            A file sharing platform that actually respects you. No ads, no tracking, no BS. Just simple, fast file sharing the way it should
            be.
          </p>

          <div className={heroStyles.chips}>
            <Chip icon={<HeartIcon size={14} />}>Made with Love</Chip>
            <Chip icon={<CoffeeIcon size={14} />}>Caffeine Powered</Chip>
            <Chip icon={<Rocket size={14} />}>ShareX Integration</Chip>
          </div>

          <div className={heroStyles.actions}>
            <Link
              to="/dashboard"
              className={cn(heroStyles.pill, heroStyles.pillPrimary)}
            >
              Start Creating Now <ArrowRight size={14} />
            </Link>
            <a
              href="#showcase"
              className={cn(heroStyles.pill, heroStyles.pillGhost)}
            >
              <Eye size={14} /> Watch demo
            </a>
            <div className={heroStyles.trust}>
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
    <span className={heroStyles.chip}>
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
    <span className={heroStyles.avatars}>
      {letters.map((l, i) => (
        <span
          key={l}
          className={heroStyles.avatar}
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
    <div className={heroStyles.stage}>
      <div className={heroStyles.glow} />

      <div className={heroStyles.scene}>
        <img
          src="/decor/hero-scene-light.webp"
          alt="Files drifting up toward a glowing crescent moon"
          className={cn(heroStyles.sceneImage, heroStyles.sceneLight)}
        />
        <img
          src="/decor/hero-scene.webp"
          alt="Files drifting up toward a glowing crescent moon"
          className={cn(heroStyles.sceneImage, heroStyles.sceneDark)}
        />
      </div>

      <div className={heroStyles.uploadCard}>
        <div className={heroStyles.uploadRow}>
          <span className={heroStyles.uploadIcon}>
            <ImageIcon size={16} />
          </span>
          <div className={heroStyles.uploadText}>
            <div className={heroStyles.uploadName}>screenshot_2026-04-21.png</div>
            <div className={heroStyles.uploadMeta}>2.4 MB · shared</div>
          </div>
          <ArrowRight
            size={15}
            className={heroStyles.uploadArrow}
          />
        </div>
        <div className={heroStyles.uploadTrack}>
          <i className={heroStyles.uploadFill} />
        </div>
      </div>

      <div className={heroStyles.privacyChip}>
        <span className={heroStyles.dot} />
        <span className={heroStyles.privacyLabel}>No ads · No tracking</span>
      </div>
    </div>
  );
}
