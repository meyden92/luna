import type React from 'react';
import { cn } from '@/libs/utils';
import styles from './MainContent.module.css';

interface MainContentProps {
  children: React.ReactNode;
  className?: string;
}

export function MainContent({ children, className }: MainContentProps) {
  return (
    <main
      id="main-content"
      className={cn(styles.root, className)}
    >
      {children}
    </main>
  );
}
