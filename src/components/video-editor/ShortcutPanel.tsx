import { ChevronRightIcon, KeyboardIcon } from 'lucide-react';
import { cn } from '@/libs/utils';

interface ShortcutPanelProps {
  open: boolean;
  onToggle: () => void;
  shortcuts?: Array<[string, string]>;
  title?: string;
}

const VIDEO_SHORTCUTS: Array<[string, string]> = [
  ['Space / K', 'Play · Pause'],
  ['J · L', 'Seek −5s · +5s'],
  ['← · →', 'Seek −1s · +1s'],
  ['Shift + ← · →', 'Seek −5s · +5s'],
  ['Home · End', 'Jump to trim start · end'],
  ['I · O', 'Set trim in · out'],
  ['C', 'Mark cut in · out'],
  ['1 · 2 · 3', 'Trim · Cut · Crop'],
  ['Ctrl + S', 'Save / Export'],
  ['?', 'Toggle this panel'],
];

export function ShortcutPanel({ open, onToggle, shortcuts = VIDEO_SHORTCUTS, title = 'Shortcuts' }: ShortcutPanelProps) {
  return (
    <div className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 z-20">
      <div
        className={cn(
          'pointer-events-auto flex items-stretch transition-transform duration-200',
          open ? 'translate-x-3' : '-translate-x-[calc(100%-2rem)]',
        )}
      >
        <div className="rounded-r-lg border border-l-0 border-border/60 bg-background/90 backdrop-blur-sm shadow-md py-3 px-4 min-w-[14rem]">
          <div className="flex items-center gap-2 text-xs font-medium text-foreground mb-2">
            <KeyboardIcon className="size-3.5" />
            {title}
          </div>
          <dl className="space-y-1.5">
            {shortcuts.map(([keys, label]) => (
              <div
                key={keys}
                className="flex items-center justify-between gap-3 text-[11px]"
              >
                <dt className="font-mono text-muted-foreground whitespace-nowrap">{keys}</dt>
                <dd className="text-foreground/90 text-right">{label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? 'Hide shortcuts' : 'Show shortcuts'}
          className="self-center rounded-r-md border border-l-0 border-border/60 bg-background/90 backdrop-blur-sm px-1 py-4 hover:bg-accent transition-colors"
        >
          <ChevronRightIcon className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
        </button>
      </div>
    </div>
  );
}
