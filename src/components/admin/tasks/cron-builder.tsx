import { Clock, Info } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { CronConfig, ScheduleType } from '@/libs/cron-utils';
import { generateCronExpression, getCronDescription, parseCronExpression } from '@/libs/cron-utils';
import { previewCronSchedule } from '@/server/fns/admin/tasks';

interface CronBuilderProps {
  value: string;
  onChange: (cronExpression: string) => void;
  className?: string;
}

type CronPreview = {
  validation: { isValid: boolean; error?: string };
  nextExecutions: Date[];
  timeZone: string;
};

function formatExecutionDate(date: Date, timeZone: string): string {
  try {
    return date.toLocaleString(undefined, { timeZone, timeZoneName: 'short' });
  } catch {
    return date.toLocaleString(undefined, { timeZoneName: 'short' });
  }
}

export default function CronBuilder({ value, onChange, className }: CronBuilderProps) {
  const [useVisualBuilder, setUseVisualBuilder] = useState(true);
  const [config, setConfig] = useState<CronConfig>({
    type: 'daily',
    hour: 0,
    minute: 0,
  });
  const [customExpression, setCustomExpression] = useState(value || '0 0 * * *');
  const [preview, setPreview] = useState<CronPreview>({
    validation: { isValid: true },
    nextExecutions: [],
    timeZone: 'UTC',
  });
  const initializedRef = useRef(false);

  // Initialize component once
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;

      if (value) {
        const parsedConfig = parseCronExpression(value);
        if (parsedConfig && parsedConfig.type !== 'custom') {
          setConfig(parsedConfig);
          setUseVisualBuilder(true);
        } else {
          setCustomExpression(value);
          setUseVisualBuilder(false);
        }
      }
    }
  }, [value]);

  const currentExpression = useVisualBuilder ? generateCronExpression(config) : customExpression;
  const validation = preview.validation;
  const nextExecutions = preview.nextExecutions;

  useEffect(() => {
    let canceled = false;

    previewCronSchedule({ data: { cronExpression: currentExpression, count: 5 } })
      .then((result) => {
        if (canceled) return;
        setPreview({
          validation: { isValid: result.isValid, error: result.error },
          nextExecutions: result.nextExecutions.map((date) => new Date(date)),
          timeZone: result.timeZone,
        });
      })
      .catch((error: Error) => {
        if (canceled) return;
        setPreview({
          validation: { isValid: false, error: error.message || 'Invalid cron expression' },
          nextExecutions: [],
          timeZone: 'UTC',
        });
      });

    return () => {
      canceled = true;
    };
  }, [currentExpression]);

  const handleConfigChange = useCallback(
    (updates: Partial<CronConfig>) => {
      const newConfig = { ...config, ...updates };
      setConfig(newConfig);
      const expression = generateCronExpression(newConfig);
      onChange(expression);
    },
    [config, onChange],
  );

  const handleCustomExpressionChange = useCallback(
    (expression: string) => {
      setCustomExpression(expression);
      onChange(expression);
    },
    [onChange],
  );

  const handleBuilderToggle = useCallback(
    (useVisual: boolean) => {
      setUseVisualBuilder(useVisual);
      const expression = useVisual ? generateCronExpression(config) : customExpression;
      onChange(expression);
    },
    [config, customExpression, onChange],
  );

  const handleTypeChange = useCallback(
    (type: ScheduleType | null) => {
      if (!type) return;
      let newConfig: CronConfig = { type };

      switch (type) {
        case 'every':
          newConfig = { type, intervalValue: 15, intervalUnit: 'minutes' };
          break;
        case 'hourly':
          newConfig = { type, minute: 0 };
          break;
        case 'daily':
          newConfig = { type, hour: 0, minute: 0 };
          break;
        case 'weekly':
          newConfig = { type, dayOfWeek: 1, hour: 0, minute: 0 };
          break;
        case 'monthly':
          newConfig = { type, dayOfMonth: 1, hour: 0, minute: 0 };
          break;
        case 'custom':
          newConfig = { type, customExpression: customExpression };
          break;
      }

      setConfig(newConfig);
      const expression = type === 'custom' ? customExpression : generateCronExpression(newConfig);
      onChange(expression);
    },
    [customExpression, onChange],
  );

  return (
    <TooltipProvider>
      <div className={className}>
        <div className="space-y-4">
          {/* Header with toggle */}
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium">Schedule</Label>
            <div className="flex items-center gap-2">
              <Label
                htmlFor="visual-builder"
                className="text-sm"
              >
                Visual Builder
              </Label>
              <Switch
                id="visual-builder"
                checked={useVisualBuilder}
                onCheckedChange={handleBuilderToggle}
              />
            </div>
          </div>

          {useVisualBuilder ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Visual Schedule Builder</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Schedule Type */}
                <div>
                  <Label htmlFor="schedule-type">Schedule Type</Label>
                  <Select
                    value={config.type}
                    onValueChange={handleTypeChange}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="every">Every (interval)</SelectItem>
                      <SelectItem value="hourly">Hourly</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="custom">Custom Expression</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Dynamic inputs based on schedule type */}
                {config.type === 'every' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Interval</Label>
                      <Input
                        type="number"
                        min="1"
                        max="999"
                        value={config.intervalValue || 1}
                        onChange={(e) => handleConfigChange({ intervalValue: Number.parseInt(e.target.value, 10) || 1 })}
                      />
                    </div>
                    <div>
                      <Label>Unit</Label>
                      <Select
                        value={config.intervalUnit || 'minutes'}
                        onValueChange={(value) => value && handleConfigChange({ intervalUnit: value as 'minutes' | 'hours' })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="minutes">Minutes</SelectItem>
                          <SelectItem value="hours">Hours</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {config.type === 'hourly' && (
                  <div>
                    <Label>Minute of Hour</Label>
                    <Select
                      value={(config.minute || 0).toString()}
                      onValueChange={(value) => value && handleConfigChange({ minute: Number.parseInt(value, 10) })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {Array.from({ length: 60 }, (_, i) => (
                          <SelectItem
                            key={i.toString()}
                            value={i.toString()}
                          >
                            :{i.toString().padStart(2, '0')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {(config.type === 'daily' || config.type === 'weekly' || config.type === 'monthly') && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Hour</Label>
                      <Select
                        value={(config.hour || 0).toString()}
                        onValueChange={(value) => value && handleConfigChange({ hour: Number.parseInt(value, 10) })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {Array.from({ length: 24 }, (_, i) => (
                            <SelectItem
                              key={i.toString()}
                              value={i.toString()}
                            >
                              {i.toString().padStart(2, '0')}:00
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Minute</Label>
                      <Select
                        value={(config.minute || 0).toString()}
                        onValueChange={(value) => value && handleConfigChange({ minute: Number.parseInt(value, 10) })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {Array.from({ length: 60 }, (_, i) => (
                            <SelectItem
                              key={i.toString()}
                              value={i.toString()}
                            >
                              :{i.toString().padStart(2, '0')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {config.type === 'weekly' && (
                  <div>
                    <Label>Day of Week</Label>
                    <Select
                      value={(config.dayOfWeek || 0).toString()}
                      onValueChange={(value) => value && handleConfigChange({ dayOfWeek: Number.parseInt(value, 10) })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Sunday</SelectItem>
                        <SelectItem value="1">Monday</SelectItem>
                        <SelectItem value="2">Tuesday</SelectItem>
                        <SelectItem value="3">Wednesday</SelectItem>
                        <SelectItem value="4">Thursday</SelectItem>
                        <SelectItem value="5">Friday</SelectItem>
                        <SelectItem value="6">Saturday</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {config.type === 'monthly' && (
                  <div>
                    <Label>Day of Month</Label>
                    <Select
                      value={(config.dayOfMonth || 1).toString()}
                      onValueChange={(value) => value && handleConfigChange({ dayOfMonth: Number.parseInt(value, 10) })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {Array.from({ length: 31 }, (_, i) => (
                          <SelectItem
                            key={(i + 1).toString()}
                            value={(i + 1).toString()}
                          >
                            {i + 1}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {config.type === 'custom' && (
                  <div>
                    <Label>Custom Cron Expression</Label>
                    <Input
                      value={customExpression}
                      onChange={(e) => handleCustomExpressionChange(e.target.value)}
                      placeholder="0 0 * * *"
                      className={!validation.isValid ? 'border-destructive' : ''}
                    />
                    {!validation.isValid && <p className="text-sm text-destructive mt-1">{validation.error}</p>}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div>
              <Label>Cron Expression</Label>
              <Input
                value={customExpression}
                onChange={(e) => handleCustomExpressionChange(e.target.value)}
                placeholder="0 0 * * * (daily at midnight)"
                className={!validation.isValid ? 'border-destructive' : ''}
              />
              {!validation.isValid && <p className="text-sm text-destructive mt-1">{validation.error}</p>}
              <p className="text-sm text-muted-foreground mt-1">Standard cron syntax: minute hour dayOfMonth month dayOfWeek</p>
            </div>
          )}

          {/* Preview */}
          <div className="space-y-3">
            <Separator />

            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Schedule Preview</span>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0"
                    />
                  }
                >
                  <Info className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Shows when this task will run next</p>
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{getCronDescription(useVisualBuilder ? config : { type: 'custom', customExpression })}</Badge>
                <code className="text-xs bg-muted px-2 py-1 rounded">{currentExpression}</code>
              </div>

              {validation.isValid && nextExecutions.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Next 5 executions:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1 text-xs">
                    {nextExecutions.map((date) => (
                      <Badge
                        key={date.getTime().toString()}
                        variant="outline"
                        className="justify-start font-mono"
                      >
                        {formatExecutionDate(date, preview.timeZone)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
