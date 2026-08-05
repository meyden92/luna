import type { ReactNode } from 'react';

interface AiRailProps {
  /** Rail header label, e.g. "Generate Settings". */
  title: string;
  /** Pinned footer slot — the primary action button (+ optional hint). */
  footer: ReactNode;
  /** Scrollable settings content. */
  children: ReactNode;
}

/**
 * Left settings rail for the AI workspace. A self-contained flex column:
 * a pinned header, an independently scrolling body, and a pinned footer.
 * Height containment is gated on `md:` so the rail flows naturally (no
 * zero-height collapse) on mobile, where the page scrolls as a whole.
 */
export function AiRail({ title, footer, children }: AiRailProps) {
  return (
    <aside className="luna-gen-side-rail relative flex flex-col border-b border-luna-line bg-luna-bg md:h-full md:min-h-0 md:overflow-hidden md:border-b-0 md:border-r">
      <div className="relative z-10 flex shrink-0 items-center gap-2.5 border-b border-luna-line bg-luna-bg px-5 pt-4 pb-3">
        <span className="luna-pulse-dot h-1.5 w-1.5 rounded-full" />
        <h2 className="m-0 text-sm font-semibold tracking-[-0.01em] text-luna-ink">{title}</h2>
      </div>

      <div className="relative z-10 space-y-6 px-5 pt-4.5 pb-5 md:min-h-0 md:flex-1 md:overflow-y-auto">{children}</div>

      <div className="relative z-10 shrink-0 border-t border-luna-line bg-luna-bg px-5 py-4">{footer}</div>
    </aside>
  );
}
