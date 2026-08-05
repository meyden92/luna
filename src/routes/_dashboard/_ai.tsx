import { createFileRoute, Link, Outlet, useLocation } from '@tanstack/react-router';
import { Sparkles } from 'lucide-react';

const tabs = [
  { to: '/ai/edit' as const, label: 'Edit' },
  { to: '/ai/generate' as const, label: 'Generate' },
  { to: '/ai/templates' as const, label: 'Templates' },
];

export const Route = createFileRoute('/_dashboard/_ai')({
  component: AILayout,
});

function AILayout() {
  const pathname = useLocation({ select: (s) => s.pathname });
  const activeTab = tabs.find((tab) => pathname === tab.to || pathname.startsWith(`${tab.to}/`));

  return (
    <div className="flex flex-col overflow-hidden rounded-[var(--luna-radius)] border border-luna-line bg-luna-bg shadow-[var(--luna-shadow-md)] md:h-[calc(100dvh-6.625rem)]">
      <div className="flex shrink-0 flex-wrap items-center gap-4 border-b border-luna-line bg-luna-bg px-7 py-3.5">
        <div className="flex items-center gap-2 text-[13px] text-luna-ink-3">
          <Sparkles size={15} />
          <b className="font-medium text-luna-ink">{activeTab?.label ?? 'Generate'}</b>
          <span className="rounded-full border border-luna-line bg-luna-bg-2 px-1.5 py-0.5 font-mono text-[11px] text-luna-ink-3">
            AI studio
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tabs.map((tab) => {
            const active = tab === activeTab;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-all ${
                  active
                    ? 'border-luna-accent bg-luna-accent text-[oklch(0.15_0.03_162)] shadow-[0_4px_14px_-6px_color-mix(in_oklab,var(--luna-accent)_60%,transparent)]'
                    : 'border-luna-line bg-luna-bg-2 text-luna-ink-3 hover:border-luna-line-2 hover:text-luna-ink'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
          <span className="ml-2 font-mono text-[10.5px] tracking-[0.12em] text-luna-ink-4">MODEL · READY</span>
          <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-luna-accent-2">
            <i className="luna-pulse-dot h-1.5 w-1.5 rounded-full" />
            live
          </span>
        </div>
      </div>

      <div className="min-h-0 md:flex-1 md:overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
