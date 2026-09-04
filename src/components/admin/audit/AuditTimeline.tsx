import { formatDistanceToNow } from 'date-fns';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { AuditLog } from '@/types/audit';
import styles from './AuditTimeline.module.css';

interface AuditTimelineProps {
  auditLogs: AuditLog[];
  selectedAuditId: string;
  onAuditSelect: (auditLog: AuditLog) => void;
}

const TONED_ACTIONS = ['create', 'update', 'delete'];

/** The action names the module tints; anything else falls back to the neutral tone. */
const getActionTone = (action: string): string | undefined => {
  const normalized = action.toLowerCase();
  return TONED_ACTIONS.includes(normalized) ? normalized : undefined;
};

// Timeline constants
const TIMELINE_ITEM_WIDTH = 120;
const TIMELINE_LINE_OFFSET = 48;
const SCROLL_SENSITIVITY = 2;

export function AuditTimeline({ auditLogs, selectedAuditId, onAuditSelect }: AuditTimelineProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  // Memoize the sorted audit logs to avoid unnecessary re-sorting
  const sortedAuditLogs = useMemo(() => [...auditLogs].reverse(), [auditLogs]);

  const checkScrollButtons = useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  }, []);

  useEffect(() => {
    checkScrollButtons();
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', checkScrollButtons);
      return () => container.removeEventListener('scroll', checkScrollButtons);
    }
    return undefined;
  }, [checkScrollButtons]);

  const scrollTimeline = useCallback((direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const SCROLL_AMOUNT = 240; // Scroll by ~2 timeline items
      const newScrollLeft = scrollContainerRef.current.scrollLeft + (direction === 'left' ? -SCROLL_AMOUNT : SCROLL_AMOUNT);
      scrollContainerRef.current.scrollTo({
        left: newScrollLeft,
        behavior: 'smooth',
      });
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scrollContainerRef.current) {
      setIsDragging(true);
      setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
      setScrollLeft(scrollContainerRef.current.scrollLeft);
    }
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || !scrollContainerRef.current) return;
      e.preventDefault();
      const x = e.pageX - scrollContainerRef.current.offsetLeft;
      const walk = (x - startX) * SCROLL_SENSITIVITY;
      scrollContainerRef.current.scrollLeft = scrollLeft - walk;
    },
    [isDragging, startX, scrollLeft],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <Card className={styles.root}>
      <CardContent className={styles.body}>
        <div className={styles.head}>
          <h3 className={styles.heading}>Change History</h3>
          <div className="cluster space-2">
            <span className={styles.count}>{auditLogs.length} changes</span>
            <div className="cluster space-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => scrollTimeline('left')}
                disabled={!canScrollLeft}
                className={styles.scrollButton}
              >
                <ChevronLeft className={styles.scrollIcon} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => scrollTimeline('right')}
                disabled={!canScrollRight}
                className={styles.scrollButton}
              >
                <ChevronRight className={styles.scrollIcon} />
              </Button>
            </div>
          </div>
        </div>

        <div className={styles.viewport}>
          {/* Scrollable timeline container */}
          <div
            ref={scrollContainerRef}
            className={styles.track}
            data-dragging={isDragging}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            {/* Timeline line */}
            <div
              className={styles.rail}
              style={{
                left: `${TIMELINE_LINE_OFFSET}px`,
                width: `${Math.max(sortedAuditLogs.length * TIMELINE_ITEM_WIDTH - TIMELINE_LINE_OFFSET * 2, 0)}px`,
              }}
            />

            {/* Timeline items */}
            <div
              className={styles.items}
              style={{
                width: `${sortedAuditLogs.length * TIMELINE_ITEM_WIDTH}px`,
              }}
            >
              {sortedAuditLogs.map((log) => {
                const isSelected = selectedAuditId === log.id;

                return (
                  <div
                    key={log.id}
                    className={styles.item}
                    data-action={getActionTone(log.action)}
                    data-selected={isSelected}
                    onClick={() => onAuditSelect(log)}
                    style={{ width: `${TIMELINE_ITEM_WIDTH}px` }}
                    onMouseDown={(e) => e.stopPropagation()} // Prevent drag when clicking timeline items
                  >
                    {/* Circle indicator */}
                    <div className={styles.node}>
                      <Check className={styles.nodeIcon} />
                    </div>

                    {/* Action label */}
                    <div className={styles.label}>
                      <Badge
                        variant={isSelected ? 'default' : 'outline'}
                        className={styles.badge}
                      >
                        {log.action}
                      </Badge>
                      <p className={styles.meta}>{log.user?.name ?? 'System'}</p>
                      <p className={styles.meta}>{formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}</p>
                    </div>

                    {/* Summary tooltip on hover */}
                    {log.summary && <div className={styles.tooltip}>{log.summary}</div>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Fade indicators for scrollable content */}
          {canScrollLeft && (
            <div
              className={styles.fade}
              data-edge="left"
            />
          )}
          {canScrollRight && (
            <div
              className={styles.fade}
              data-edge="right"
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
