import type { ReactNode } from 'react';

interface AiWorkspaceProps {
  /** Left settings rail (an <AiRail> element). */
  rail: ReactNode;
  /** Compact page title shown above the results pane. */
  title: string;
  /** One-line descriptor under the title. */
  subtitle: string;
  /** Results / gallery content for the right pane. */
  children: ReactNode;
}

/**
 * Two-column AI workspace: a fixed settings rail and an independently
 * scrolling results pane. On `md+` the grid fills its bounded parent and each
 * column scrolls on its own; below `md` it stacks and scrolls as one page.
 */
export function AiWorkspace({ rail, title, subtitle, children }: AiWorkspaceProps) {
  return (
    <div className="grid grid-cols-1 md:h-full md:min-h-0 md:grid-cols-[340px_1fr]">
      {rail}

      <section className="luna-gen-main-glow relative flex flex-col md:h-full md:min-h-0 md:overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-0 bottom-0 w-px opacity-60"
          style={{ background: 'linear-gradient(180deg, transparent, var(--luna-line) 20%, var(--luna-line) 80%, transparent)' }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-0 bottom-0 w-px opacity-60"
          style={{ background: 'linear-gradient(180deg, transparent, var(--luna-line) 20%, var(--luna-line) 80%, transparent)' }}
        />

        <header className="relative z-10 shrink-0 px-8 pt-6 pb-4">
          <h1 className="m-0 mb-1 font-serif text-[28px] font-normal leading-tight tracking-[-0.02em] text-luna-ink">{title}</h1>
          <p className="m-0 max-w-[56ch] text-sm leading-[1.5] text-luna-ink-3">{subtitle}</p>
        </header>

        <div className="relative z-10 px-8 pb-6 md:min-h-0 md:flex-1 md:overflow-y-auto">{children}</div>
      </section>
    </div>
  );
}
