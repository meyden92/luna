import { ImageIcon, Link2, MegaphoneOff, Share2, Sparkles, Star } from 'lucide-react';
import { cn } from '@/libs/utils';
import styles from './Features.module.css';

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
    <section className={styles.root}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>01 — Why Choose LunaShare?</span>
        <span className={styles.headline}>Features That Actually Matter</span>
      </div>
      <div className={styles.grid}>
        {FEATURES.map((feature, index) => {
          const Ic = feature.icon;
          return (
            <div
              key={feature.tag}
              className={cn(styles.cell, index > 0 && styles.cellDivided)}
            >
              <div className={styles.icon}>
                <Ic size={18} />
              </div>
              <h4 className={styles.title}>{feature.title}</h4>
              <p className={styles.description}>{feature.description}</p>
              <span className={styles.tag}>{feature.tag}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
