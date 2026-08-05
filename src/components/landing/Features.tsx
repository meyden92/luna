import { ImageIcon, Link2, MegaphoneOff, Share2, Sparkles, Star } from 'lucide-react';

const FEATURES = [
  {
    icon: Share2,
    title: 'Secure Transfer',
    description: 'Share files instantly with enterprise-grade security and end-to-end encryption',
    tag: '01',
  },
  {
    icon: Link2,
    title: 'ShareX Integration',
    description: 'Seamless integration with ShareX for effortless screenshot and file sharing',
    tag: '02',
  },
  {
    icon: ImageIcon,
    title: 'Multi-Format Support',
    description: 'Handle any file type with ease - images, audio, videos, and more',
    tag: '03',
  },
  {
    icon: MegaphoneOff,
    title: 'Ad-Free Experience',
    description: 'Enjoy a clean, distraction-free platform with no advertisements or user behavior tracking',
    tag: '04',
  },
  { icon: Star, title: 'AI-Powered', description: 'Generate and enhance images using our advanced AI technology', tag: '05' },
  { icon: Sparkles, title: 'Continuous Innovation', description: 'Regular updates with new features to enhance your workflow', tag: '06' },
] as const;

export default function Features() {
  return (
    <section className="relative mx-auto max-w-[1280px] px-9 py-[54px_30px]">
      <div className="flex items-baseline justify-between border-t border-luna-line pt-[22px]">
        <span className="font-mono text-[11px] tracking-[0.12em] text-luna-ink-3">01 — Why Choose LunaShare?</span>
        <span className="font-serif text-[28px] tracking-[-0.01em] text-luna-ink">Features That Actually Matter</span>
      </div>
      <div className="mt-7 grid grid-cols-1 border-t border-luna-line sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((feature, index) => {
          const Ic = feature.icon;
          return (
            <div
              key={feature.tag}
              className={`group relative py-[22px] pr-[22px] ${index > 0 ? 'pl-[22px] border-l border-luna-line' : ''}`}
            >
              <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-luna-accent-soft text-luna-accent-2 transition-transform duration-[250ms] group-hover:-rotate-6 group-hover:scale-105">
                <Ic size={18} />
              </div>
              <h4 className="mb-1.5 text-[14.5px] font-semibold tracking-[-0.01em] text-luna-ink">{feature.title}</h4>
              <p className="text-[13px] leading-[1.5] text-luna-ink-3">{feature.description}</p>
              <span className="absolute right-0 top-[22px] font-mono text-[10px] tracking-[0.1em] text-luna-ink-4 lg:right-[22px] group-last:lg:right-0">
                {feature.tag}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
