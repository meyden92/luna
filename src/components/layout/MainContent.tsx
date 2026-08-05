import type React from 'react';
import { cn } from '@/libs/utils';

interface MainContentProps {
  children: React.ReactNode;
  className?: string;
}

export function MainContent({ children, className }: MainContentProps) {
  return (
    <main
      id="main-content"
      // Nav is fixed and 74px tall (4.625rem). Impersonation bar is in flow above
      // MainContent, so it doesn't add to the pt. Padding matches nav height so
      // any sticky content with top-[4.625rem] docks pixel-perfect under the nav.
      className={cn('flex-1 min-h-0 pt-[4.625rem]', className)}
    >
      {children}
    </main>
  );
}
