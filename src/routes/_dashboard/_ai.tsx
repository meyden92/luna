import { createFileRoute, Link, Outlet, useLocation } from '@tanstack/react-router';
import { Sparkles } from 'lucide-react';
import styles from './_ai.module.css';

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
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <div className={styles.status}>
          <Sparkles size={15} />
          <b className={styles.statusLabel}>{activeTab?.label ?? 'Generate'}</b>
          <span className={styles.badge}>AI studio</span>
        </div>
        <div className={styles.tabs}>
          {tabs.map((tab) => {
            const active = tab === activeTab;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={styles.tab}
                data-active={active}
              >
                {tab.label}
              </Link>
            );
          })}
          <span className={styles.modelState}>MODEL · READY</span>
          <span className={styles.live}>
            <i className={styles.liveDot} />
            live
          </span>
        </div>
      </div>

      <div className={styles.body}>
        <Outlet />
      </div>
    </div>
  );
}
