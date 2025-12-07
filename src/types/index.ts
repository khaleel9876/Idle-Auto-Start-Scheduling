export interface AutoStartSchedule {
  provider: 'aws';
  instanceId: string;
  region: string;
  cron: string;
  enabled?: boolean;
  timezone?: string;
  tags?: Record<string, string>;
  name?: string;
}

export interface ScheduleConfig {
  autoStartSchedules: AutoStartSchedule[];
}

export interface StartResult {
  instanceId: string;
  region: string;
  success: boolean;
  error?: string;
  startTime: Date;
  duration?: number;
  previousState?: string;
  currentState?: string;
}
