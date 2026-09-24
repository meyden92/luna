import type React from 'react';
import { cn } from '@/libs/utils';
import styles from './MainContent.module.css';

interface MainContentProps {
  children: React.ReactNode;
  className?: string;
  /** True under the marketing nav, which is fixed and so sits over the page. */
  fixedNav?: boolean;
}

export function MainContent({ children, className, fixedNav = false }: MainContentProps) {
  return (
    <main
      id="main-content"
      data-fixed-nav={fixedNav || undefined}
      className={cn(styles.root, className)}
    >
      {children}
    </main>
  );
}
