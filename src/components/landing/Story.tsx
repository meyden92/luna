import { Upload } from 'lucide-react';
import { useEffect, useState } from 'react';

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
      className="relative mx-auto max-w-[1280px] px-9 py-[40px_60px]"
    >
      <div className="relative overflow-hidden rounded-[20px] border border-luna-line bg-luna-bg">
        <div className="flex items-center justify-between border-b border-luna-line bg-luna-bg-2 px-[18px] py-3.5">
          <div className="flex gap-1.5">
            <i className="h-2.5 w-2.5 rounded-full bg-[#F87171]" />
            <i className="h-2.5 w-2.5 rounded-full bg-[#FBBF24]" />
            <i className="h-2.5 w-2.5 rounded-full bg-[#34D399]" />
          </div>
          <div className="rounded-lg border border-luna-line bg-luna-bg px-2.5 py-1 font-mono text-[11px] text-luna-ink-3">
            lunashare.app / upload
          </div>
          <div className="font-mono text-[10px] text-luna-ink-4">LIVE · 23ms</div>
        </div>
        <div className="relative grid items-center gap-8 p-[32px_24px] md:p-[44px_40px] lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h2 className="mb-3.5 font-serif text-[48px] font-normal leading-[1.02] tracking-[-0.02em] text-luna-ink">Why I Built This</h2>
            <p className="max-w-[48ch] text-[14.5px] leading-[1.6] text-luna-ink-3">
              Every great project starts with a problem that needs solving. Here's mine.
            </p>
            <div className="mt-5.5 flex flex-col gap-3.5">
              {STEPS.map((step, i) => (
                <div
                  key={step.t}
                  className="flex items-start gap-3.5 rounded-xl border border-luna-line bg-luna-bg p-3.5 transition-all hover:translate-x-[3px] hover:border-luna-line-2"
                >
                  <span
                    className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs ${
                      i === 0 ? 'bg-luna-accent text-[oklch(0.15_0.03_162)]' : 'bg-luna-ink text-luna-bg'
                    }`}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h5 className="mb-1 text-[13.5px] font-semibold text-luna-ink">{step.t}</h5>
                    <p className="text-[12.5px] leading-[1.45] text-luna-ink-3">{step.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="luna-panel-corners relative flex aspect-[4/3.2] items-center justify-center rounded-[14px] border border-luna-line bg-gradient-to-tl from-luna-bg to-luna-bg-2 p-5">
            <div
              className={`relative flex aspect-[1.4] w-[82%] cursor-pointer flex-col items-center justify-center gap-2.5 rounded-[14px] border-[1.5px] border-dashed border-luna-line-2 bg-[color-mix(in_oklab,var(--luna-bg)_70%,transparent)] transition-all duration-300 ${
                hot ? 'luna-drop-hot' : ''
              }`}
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
              <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-luna-bg text-luna-accent-2 shadow-[0_1px_0_rgba(15,21,17,0.04),0_1px_2px_rgba(15,21,17,0.04)]">
                <Upload size={22} />
              </div>
              <h6 className="mt-1.5 text-sm font-semibold text-luna-ink">Drop files here</h6>
              <small className="text-xs text-luna-ink-3">or paste from clipboard — ⌘V</small>
              <div className="absolute inset-x-3 bottom-3 flex flex-col gap-1.5">
                {queue.map((q) => (
                  <div
                    key={q.id}
                    className="luna-slide-in flex items-center gap-2 rounded-lg border border-luna-line bg-luna-bg px-2 py-1.5 font-mono text-[11px] text-luna-ink-3"
                  >
                    <span className="max-w-[55%] basis-auto truncate">{q.n}</span>
                    <div className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-luna-bg-3">
                      <i className="luna-fill-x absolute inset-0 rounded-full bg-luna-accent" />
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
