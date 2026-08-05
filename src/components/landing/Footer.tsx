import { Link } from '@tanstack/react-router';
import { Code, Globe, Star } from 'lucide-react';
import { Brandmark } from './Brandmark';

const COLUMNS = [
  {
    heading: 'Product',
    items: [
      { label: 'Dashboard', to: '/dashboard' },
      { label: 'Generate', to: '/ai/generate' },
      { label: 'Snippets', to: '/bin' },
      { label: 'Tools', to: '/tools/audio' },
    ],
  },
  {
    heading: 'Developers',
    items: [
      { label: 'API', to: '/settings' },
      { label: 'ShareX', to: '/settings' },
    ],
  },
  {
    heading: 'Legal',
    items: [
      { label: 'Privacy', to: '/privacy' },
      { label: 'Terms', to: '/tos' },
    ],
  },
] as const;

export default function Footer() {
  return (
    <footer className="py-10 pb-8">
      <div className="mx-auto max-w-[1280px] px-9">
        <div className="flex flex-wrap justify-between gap-7">
          <div className="max-w-[280px]">
            <div className="mb-3 flex items-center gap-2.5">
              <Brandmark />
              <div className="text-[15px] font-semibold leading-none tracking-[-0.01em] text-luna-ink">
                Luna
                <br />
                Share
              </div>
            </div>
            <p className="m-0 text-[12.5px] leading-[1.6] text-luna-ink-3">
              Secure and seamless file sharing platform for teams and individuals.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-14 gap-y-6">
            {COLUMNS.map((col) => (
              <div key={col.heading}>
                <h6 className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-luna-ink-4">{col.heading}</h6>
                <ul className="flex list-none flex-col gap-2 p-0">
                  {col.items.map((item) => (
                    <li key={item.to + item.label}>
                      <Link
                        to={item.to}
                        className="text-[13px] text-luna-ink-2 hover:text-luna-ink"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-9 flex items-center justify-between border-t border-luna-line pt-[18px] text-xs text-luna-ink-4">
          <div>©2025 LunaShare · All rights reserved.</div>
          <div className="flex items-center gap-[18px]">
            <a
              href="mailto:contact@lunashare.app"
              aria-label="Contact"
              className="text-luna-ink-2 hover:text-luna-ink"
            >
              <Globe size={18} />
            </a>
            <a
              href="https://github.com/crysis992"
              aria-label="GitHub"
              className="text-luna-ink-2 hover:text-luna-ink"
            >
              <Code size={18} />
            </a>
            <Link
              to="/dashboard"
              aria-label="Dashboard"
              className="text-luna-ink-2 hover:text-luna-ink"
            >
              <Star size={18} />
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
