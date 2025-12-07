import { EventBridgeEvent } from 'aws-lambda';
import { ScheduleParser } from '../services/scheduleParser';
import { EC2Service } from '../services/ec2Service';
import { S3Service } from '../services/s3Service';
import { EmailService } from '../services/emailService';

export const handler = async (event: EventBridgeEvent<string, any>): Promise<void> => {
  console.log('Auto-start Lambda triggered at:', new Date().toISOString());
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    // Get environment variables
    const configBucket = process.env.CONFIG_BUCKET!;
    const configKey = process.env.CONFIG_KEY || 'config/settings.json';
    const fromEmail = process.env.FROM_EMAIL!;
    const toEmail = process.env.TO_EMAIL!;
    const region = process.env.AWS_REGION || 'us-east-1';

    // Load configuration from S3
    const s3Service = new S3Service(region);
    const config = await s3Service.getConfig(configBucket, configKey);

    // Parse schedules
    const parser = new ScheduleParser(config.autoStartSchedules);
    const schedulesToRun = parser.getSchedulesToRun();

    if (schedulesToRun.length === 0) {
      console.log('No schedules to run at this time');
      return;
    }

    console.log(`Found ${schedulesToRun.length} schedules to execute`);

    // Start instances
    const ec2Service = new EC2Service();
    const instances = schedulesToRun.map(s => ({
      instanceId: s.instanceId,
      region: s.region
    }));

    const results = await ec2Service.startMultipleInstances(instances);

    // Send summary email
    const emailService = new EmailService(fromEmail, toEmail, region);
    await emailService.sendSummary(results);

    // Log results
    console.log('Auto-start execution completed');
    console.log(`Successful: ${results.filter(r => r.success).length}`);
    console.log(`Failed: ${results.filter(r => !r.success).length}`);

  } catch (error) {
    console.error('Error in auto-start handler:', error);
    throw error;
  }
};
