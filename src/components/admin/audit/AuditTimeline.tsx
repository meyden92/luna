import { formatDistanceToNow } from 'date-fns';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/libs/utils';
import type { AuditLog } from '@/types/audit';

interface AuditTimelineProps {
  auditLogs: AuditLog[];
  selectedAuditId: string;
  onAuditSelect: (auditLog: AuditLog) => void;
}

type ActionType = 'create' | 'update' | 'delete';

interface ActionColors {
  bg: string;
  border: string;
  text: string;
  lightBg: string;
}

const ACTION_COLORS: Record<ActionType, ActionColors> = {
  create: {
    bg: 'bg-emerald-500',
    border: 'border-emerald-200 dark:border-emerald-800',
    text: 'text-emerald-700 dark:text-emerald-300',
    lightBg: 'bg-emerald-50 dark:bg-emerald-950/50',
  },
  update: {
    bg: 'bg-blue-500',
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-blue-700 dark:text-blue-300',
    lightBg: 'bg-blue-50 dark:bg-blue-950/50',
  },
  delete: {
    bg: 'bg-red-500',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-700 dark:text-red-300',
    lightBg: 'bg-red-50 dark:bg-red-950/50',
  },
};

const DEFAULT_COLORS: ActionColors = {
  bg: 'bg-muted-foreground',
  border: 'border-border',
  text: 'text-muted-foreground',
  lightBg: 'bg-muted/50',
};

const getActionColor = (action: string): ActionColors => {
  const normalizedAction = action.toLowerCase() as ActionType;
  return ACTION_COLORS[normalizedAction] || DEFAULT_COLORS;
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
    <Card className="overflow-hidden">
      <CardContent className="p-6 overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">Change History</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{auditLogs.length} changes</span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => scrollTimeline('left')}
                disabled={!canScrollLeft}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => scrollTimeline('right')}
                disabled={!canScrollRight}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="relative w-full overflow-hidden">
          {/* Scrollable timeline container */}
          <div
            ref={scrollContainerRef}
            className={cn(
              'overflow-x-auto overflow-y-hidden scrollbar-hide relative w-full',
              isDragging ? 'cursor-grabbing' : 'cursor-grab',
            )}
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
              className="absolute top-6 h-0.5 bg-border"
              style={{
                left: `${TIMELINE_LINE_OFFSET}px`,
                width: `${Math.max(sortedAuditLogs.length * TIMELINE_ITEM_WIDTH - TIMELINE_LINE_OFFSET * 2, 0)}px`,
              }}
            />

            {/* Timeline items */}
            <div
              className="flex items-start gap-0"
              style={{
                width: `${sortedAuditLogs.length * TIMELINE_ITEM_WIDTH}px`,
              }}
            >
              {sortedAuditLogs.map((log, _index) => {
                const colors = getActionColor(log.action);
                const isSelected = selectedAuditId === log.id;

                return (
                  <div
                    key={log.id}
                    className="flex flex-col items-center relative cursor-pointer group flex-shrink-0"
                    onClick={() => onAuditSelect(log)}
                    style={{ width: `${TIMELINE_ITEM_WIDTH}px` }}
                    onMouseDown={(e) => e.stopPropagation()} // Prevent drag when clicking timeline items
                  >
                    {/* Circle indicator */}
                    <div
                      className={cn(
                        'relative z-10 w-12 h-12 rounded-full border-4 flex items-center justify-center transition-all duration-200',
                        isSelected
                          ? `${colors.bg} border-background shadow-lg scale-110`
                          : `bg-background ${colors.border} group-hover:${colors.lightBg} group-hover:scale-105`,
                      )}
                    >
                      <Check className={cn('h-5 w-5 transition-colors', isSelected ? 'text-white' : colors.text)} />
                    </div>

                    {/* Action label */}
                    <div className="mt-3 text-center">
                      <Badge
                        variant={isSelected ? 'default' : 'outline'}
                        className={cn('text-xs font-medium mb-1', isSelected && `${colors.bg} text-white border-transparent`)}
                      >
                        {log.action}
                      </Badge>
                      <p className="text-xs text-muted-foreground">{log.user?.name ?? 'System'}</p>
                      <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}</p>
                    </div>

                    {/* Summary tooltip on hover */}
                    {log.summary && (
                      <div className="absolute top-16 left-1/2 transform -translate-x-1/2 bg-popover text-popover-foreground text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-20 whitespace-nowrap max-w-48 truncate border border-border shadow-md">
                        {log.summary}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Fade indicators for scrollable content */}
          {canScrollLeft && (
            <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background to-transparent pointer-events-none z-10" />
          )}
          {canScrollRight && (
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none z-10" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
