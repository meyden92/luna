import { parseCronExpression as parseScheduleCronExpression } from 'cron-schedule';

export type ScheduleType = 'every' | 'daily' | 'hourly' | 'weekly' | 'monthly' | 'custom';

export interface CronConfig {
  type: ScheduleType;
  minute?: number;
  hour?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  intervalValue?: number;
  intervalUnit?: 'minutes' | 'hours';
  customExpression?: string;
}

export function generateCronExpression(config: CronConfig): string {
  switch (config.type) {
    case 'every': {
      const { intervalValue = 1, intervalUnit = 'minutes' } = config;
      if (intervalUnit === 'minutes') {
        return `*/${intervalValue} * * * *`;
      }
      return `0 */${intervalValue} * * *`;
    }
    case 'hourly': {
      const minute = config.minute ?? 0;
      return `${minute} * * * *`;
    }
    case 'daily': {
      const hour = config.hour ?? 0;
      const minute = config.minute ?? 0;
      return `${minute} ${hour} * * *`;
    }
    case 'weekly': {
      const dayOfWeek = config.dayOfWeek ?? 0;
      const hour = config.hour ?? 0;
      const minute = config.minute ?? 0;
      return `${minute} ${hour} * * ${dayOfWeek}`;
    }
    case 'monthly': {
      const dayOfMonth = config.dayOfMonth ?? 1;
      const hour = config.hour ?? 0;
      const minute = config.minute ?? 0;
      return `${minute} ${hour} ${dayOfMonth} * *`;
    }
    case 'custom': {
      return config.customExpression ?? '0 0 * * *';
    }
    default:
      return '0 0 * * *';
  }
}

// ---- parseCronExpression predicates ----

type CronParts = [string, string, string, string, string];

function isEveryMinutes([minute, hour, dom, month, dow]: CronParts): boolean {
  return minute.startsWith('*/') && hour === '*' && dom === '*' && month === '*' && dow === '*';
}

function isEveryHours([minute, hour, dom, month, dow]: CronParts): boolean {
  return minute === '0' && hour.startsWith('*/') && dom === '*' && month === '*' && dow === '*';
}

function isHourly([minute, hour, dom, month, dow]: CronParts): boolean {
  return !minute.includes('*') && hour === '*' && dom === '*' && month === '*' && dow === '*';
}

function isDaily([minute, hour, dom, month, dow]: CronParts): boolean {
  return !minute.includes('*') && !hour.includes('*') && dom === '*' && month === '*' && dow === '*';
}

function isWeekly([minute, hour, dom, month, dow]: CronParts): boolean {
  return !minute.includes('*') && !hour.includes('*') && dom === '*' && month === '*' && !dow.includes('*');
}

function isMonthly([minute, hour, dom, month, dow]: CronParts): boolean {
  return !minute.includes('*') && !hour.includes('*') && !dom.includes('*') && month === '*' && dow === '*';
}

// ---- end predicates ----

export function parseCronExpression(cronExpression: string): CronConfig | null {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) {
    return null;
  }

  const p: CronParts = [minute, hour, dayOfMonth, month, dayOfWeek];

  if (isEveryMinutes(p)) {
    return { type: 'every', intervalValue: Number.parseInt(minute.slice(2), 10), intervalUnit: 'minutes' };
  }

  if (isEveryHours(p)) {
    return { type: 'every', intervalValue: Number.parseInt(hour.slice(2), 10), intervalUnit: 'hours' };
  }

  if (isHourly(p)) {
    return { type: 'hourly', minute: Number.parseInt(minute, 10) };
  }

  if (isDaily(p)) {
    return { type: 'daily', hour: Number.parseInt(hour, 10), minute: Number.parseInt(minute, 10) };
  }

  if (isWeekly(p)) {
    return {
      type: 'weekly',
      dayOfWeek: Number.parseInt(dayOfWeek, 10),
      hour: Number.parseInt(hour, 10),
      minute: Number.parseInt(minute, 10),
    };
  }

  if (isMonthly(p)) {
    return {
      type: 'monthly',
      dayOfMonth: Number.parseInt(dayOfMonth, 10),
      hour: Number.parseInt(hour, 10),
      minute: Number.parseInt(minute, 10),
    };
  }

  return { type: 'custom', customExpression: cronExpression };
}

export function getCronDescription(config: CronConfig): string {
  switch (config.type) {
    case 'every': {
      const { intervalValue = 1, intervalUnit = 'minutes' } = config;
      if (intervalValue === 1) {
        return intervalUnit === 'minutes' ? 'Every minute' : 'Every hour';
      }
      return `Every ${intervalValue} ${intervalUnit}`;
    }
    case 'hourly': {
      const minute = config.minute ?? 0;
      if (minute === 0) return 'Every hour (at :00)';
      return `Every hour at :${minute.toString().padStart(2, '0')}`;
    }
    case 'daily': {
      const hour = config.hour ?? 0;
      const minute = config.minute ?? 0;
      const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      return `Daily at ${timeStr}`;
    }
    case 'weekly': {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayOfWeek = config.dayOfWeek ?? 0;
      const hour = config.hour ?? 0;
      const minute = config.minute ?? 0;
      const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      return `Weekly on ${days[dayOfWeek]} at ${timeStr}`;
    }
    case 'monthly': {
      const dayOfMonth = config.dayOfMonth ?? 1;
      const hour = config.hour ?? 0;
      const minute = config.minute ?? 0;
      const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      const ordinal = getOrdinal(dayOfMonth);
      return `Monthly on the ${ordinal} at ${timeStr}`;
    }
    case 'custom': {
      return `Custom: ${config.customExpression ?? 'Invalid expression'}`;
    }
    default:
      return 'Unknown schedule';
  }
}

function getOrdinal(num: number): string {
  const suffix = ['th', 'st', 'nd', 'rd'];
  const v = num % 100;
  const suffixIndex = (v - 20) % 10;
  return num + (suffix[suffixIndex] || suffix[v] || suffix[0] || 'th');
}

export function getNextExecutions(cronExpression: string, count = 5): Date[] {
  try {
    return parseScheduleCronExpression(cronExpression).getNextDates(count);
  } catch (_error) {
    return [];
  }
}

export function validateCronExpression(cronExpression: string): { isValid: boolean; error?: string } {
  try {
    parseScheduleCronExpression(cronExpression).getNextDate();
    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Invalid cron expression',
    };
  }
}
