export interface CronJobConfig {
  name: string;
  schedule: string;
  description: string;
  enabled: boolean;
}

export interface EmailConfig {
  batchSize: number;
  delayBetweenEmails: number;
  delayBetweenBatches: number;
  maxRetries: number;
}

export interface ReminderMailConfig extends EmailConfig {
  missingDaysThreshold: number;
}
