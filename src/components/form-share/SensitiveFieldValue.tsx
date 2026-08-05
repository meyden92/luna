import { Check, Copy, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/libs/utils';
import { revealFormShareField } from '@/server/fns/platform';

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
      className="space-y-1.5"
      onMouseEnter={pauseTimer}
      onMouseLeave={resumeTimer}
      onFocus={pauseTimer}
      onBlur={resumeTimer}
    >
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono break-all">{revealedValue ?? '\u2022'.repeat(12)}</code>

        <div className="flex items-center gap-1 shrink-0">
          {revealedValue && (
            <span
              className={cn(
                'text-xs tabular-nums w-6 text-center',
                secondsLeft <= 5 ? 'text-destructive animate-pulse' : 'text-muted-foreground',
              )}
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
            {isRevealing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : revealedValue ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleCopy}
            disabled={!revealedValue}
            title="Copy"
          >
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
