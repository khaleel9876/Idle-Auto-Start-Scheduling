"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScheduleParser = void 0;
class ScheduleParser {
    constructor(schedules) {
        this.schedules = schedules;
        this.validateSchedules();
    }
    validateSchedules() {
        this.schedules.forEach((schedule, index) => {
            try {
                const cronParser = require('cron-parser');
                const parser = cronParser.CronExpressionParser || cronParser.default;
                // Validate the cron expression by parsing it
                parser.parse(schedule.cron);
                if (!schedule.instanceId) {
                    throw new Error('instanceId is required');
                }
                if (!schedule.region) {
                    throw new Error('region is required');
                }
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                throw new Error(`Invalid schedule at index ${index}: ${errorMessage}`);
            }
        });
    }
    getSchedulesToRun(currentTime = new Date()) {
        const cronParser = require('cron-parser');
        const parser = cronParser.CronExpressionParser || cronParser.default;
        return this.schedules.filter(schedule => {
            if (schedule.enabled === false)
                return false;
            try {
                const interval = parser.parse(schedule.cron, {
                    currentDate: currentTime,
                    tz: schedule.timezone || 'UTC'
                });
                const nextRun = interval.prev().toDate();
                const timeDiff = Math.abs(currentTime.getTime() - nextRun.getTime());
                // Run if within 1 minute of scheduled time
                return timeDiff < 60000;
            }
            catch (error) {
                console.error(`Error parsing schedule for ${schedule.instanceId}:`, error);
                return false;
            }
        });
    }
}
exports.ScheduleParser = ScheduleParser;
