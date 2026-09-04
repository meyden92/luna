import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './LightboxPortal.module.css';

interface LightboxPortalProps {
  children: ReactNode;
  isOpen: boolean;
}

export function LightboxPortal({ children, isOpen }: LightboxPortalProps) {
  const [mounted, setMounted] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle animation timing - keep rendering during exit animation
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      return;
    }
    // Delay unmount to allow exit animation
    const timer = setTimeout(() => {
      setShouldRender(false);
    }, 150);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Focus management: move focus into the dialog on open, trap Tab, restore on close
  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const node = containerRef.current;
    node?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !node) return;
      const focusables = node.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) {
        e.preventDefault();
        return;
      }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    node?.addEventListener('keydown', handleKeyDown);
    return () => {
      node?.removeEventListener('keydown', handleKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [isOpen]);

  if (!mounted || !shouldRender) return null;

  return createPortal(
    <div
      ref={containerRef}
      tabIndex={-1}
      aria-label="Image viewer"
      className={styles.root}
      data-closing={isOpen ? undefined : ''}
      aria-modal="true"
      role="dialog"
    >
      {children}
    </div>,
    document.body,
  );
}
