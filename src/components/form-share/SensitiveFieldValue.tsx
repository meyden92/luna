import { Check, Copy, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { revealFormShareField } from '@/server/fns/platform';
import styles from './SensitiveFieldValue.module.css';

const REVEAL_DURATION = 30;

export function SensitiveFieldValue({ shareId, fieldId, viewToken }: { shareId: string; fieldId: string; viewToken: string | null }) {
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(REVEAL_DURATION);
  const [copied, setCopied] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isInteractingRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    setRevealedValue(null);
    setSecondsLeft(REVEAL_DURATION);
    clearTimer();
  }, [clearTimer]);

  const startTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearTimer();
          setRevealedValue(null);
          return REVEAL_DURATION;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearTimer]);

  const reveal = useCallback(async () => {
    if (!viewToken || isRevealing) return;

    setIsRevealing(true);
    setError(null);
    try {
      const result = await revealFormShareField({ data: { shareId, fieldId, token: viewToken } });
      setRevealedValue(result.value);
      setSecondsLeft(REVEAL_DURATION);
      if (!isInteractingRef.current) startTimer();
    } catch (revealError) {
      setError(revealError instanceof Error ? revealError.message : 'Could not reveal field');
    } finally {
      setIsRevealing(false);
    }
  }, [fieldId, isRevealing, shareId, startTimer, viewToken]);

  useEffect(() => {
    return clearTimer;
  }, [clearTimer]);

  const pauseTimer = useCallback(() => {
    isInteractingRef.current = true;
    if (revealedValue) clearTimer();
  }, [clearTimer, revealedValue]);

  const resumeTimer = useCallback(() => {
    isInteractingRef.current = false;
    if (revealedValue && !timerRef.current) startTimer();
  }, [revealedValue, startTimer]);

  const handleCopy = async () => {
    if (!revealedValue) return;

    await navigator.clipboard.writeText(revealedValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={styles.root}
      onMouseEnter={pauseTimer}
      onMouseLeave={resumeTimer}
      onFocus={pauseTimer}
      onBlur={resumeTimer}
    >
      <div className={styles.valueRow}>
        <code className={styles.value}>{revealedValue ?? '\u2022'.repeat(12)}</code>

        <div className={styles.actions}>
          {revealedValue && (
            <span
              className={styles.countdown}
              data-urgent={secondsLeft <= 5}
            >
              {secondsLeft}s
            </span>
          )}

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={revealedValue ? hide : reveal}
            disabled={!revealedValue && (!viewToken || isRevealing)}
            title={revealedValue ? 'Hide' : 'Reveal'}
          >
            {isRevealing ? <Loader2 className={styles.spinner} /> : revealedValue ? <EyeOff /> : <Eye />}
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleCopy}
            disabled={!revealedValue}
            title="Copy"
          >
            {copied ? <Check className={styles.copiedIcon} /> : <Copy />}
          </Button>
        </div>
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
