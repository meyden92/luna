import { Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/libs/utils';
import styles from './Story.module.css';

const sampleFiles = ['sunset-walk.jpg', 'status-report.pdf', 'recording-003.mov', 'notes.md'];

const STEPS = [
  {
    t: 'The Problem',
    d: 'I was tired of file sharing services that were slow, bloated with ads, were limited. And I was not sure what they did with my files.',
  },
  {
    t: 'The Solution',
    d: "So I built LunaShare in my spare time. No ads, no tracking, full controle over my files. Just fast, simple file sharing with ShareX integration that actually works. It's not perfect yet, but it's honest and it's getting better every day.",
  },
  { t: 'Share the link', d: 'A short lunashare.app URL — copied the moment it’s ready.' },
] as const;

export default function Story() {
  const [hot, setHot] = useState(false);
  const [queue, setQueue] = useState<{ id: number; n: string }[]>([]);

  useEffect(() => {
    const id = setInterval(() => {
      setQueue((prev) => {
        const next = sampleFiles[Math.floor(Math.random() * sampleFiles.length)]!;
        return [...prev, { id: Date.now() + Math.random(), n: next }].slice(-2);
      });
    }, 2600);
    return () => clearInterval(id);
  }, []);

  return (
    <section
      id="showcase"
      className={styles.root}
    >
      <div className={styles.window}>
        <div className={styles.titleBar}>
          <div className={styles.lights}>
            <i className={cn(styles.light, styles.lightClose)} />
            <i className={cn(styles.light, styles.lightMinimise)} />
            <i className={cn(styles.light, styles.lightZoom)} />
          </div>
          <div className={styles.address}>lunashare.app / upload</div>
          <div className={styles.latency}>LIVE · 23ms</div>
        </div>
        <div className={styles.body}>
          <div>
            <h2 className={styles.headline}>Why I Built This</h2>
            <p className={styles.lede}>Every great project starts with a problem that needs solving. Here's mine.</p>
            <div className={styles.steps}>
              {STEPS.map((step, i) => (
                <div
                  key={step.t}
                  className={styles.step}
                >
                  <span className={cn(styles.stepBadge, i === 0 && styles.stepBadgeFirst)}>{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <h5 className={styles.stepTitle}>{step.t}</h5>
                    <p className={styles.stepBody}>{step.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.panel}>
            <div
              className={styles.dropzone}
              data-hot={hot || undefined}
              onDragOver={(e) => {
                e.preventDefault();
                setHot(true);
              }}
              onDragLeave={() => setHot(false)}
              onDrop={(e) => {
                e.preventDefault();
                setHot(false);
              }}
            >
              <div className={styles.dropIcon}>
                <Upload size={22} />
              </div>
              <h6 className={styles.dropTitle}>Drop files here</h6>
              <small className={styles.dropHint}>or paste from clipboard — ⌘V</small>
              <div className={styles.queue}>
                {queue.map((q) => (
                  <div
                    key={q.id}
                    className={styles.queueItem}
                  >
                    <span className={styles.queueName}>{q.n}</span>
                    <div className={styles.queueTrack}>
                      <i className={styles.queueFill} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
