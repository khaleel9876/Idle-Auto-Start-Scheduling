import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { ScheduleConfig } from '../types';

export class S3Service {
  private client: S3Client;

  constructor(region: string = 'us-east-1') {
    this.client = new S3Client({ region });
  }

  async getConfig(bucket: string, key: string): Promise<ScheduleConfig> {
    try {
      console.log(`Loading config from s3://${bucket}/${key}`);
      
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key
      });

      const response = await this.client.send(command);
      const bodyString = await response.Body?.transformToString();
      
      if (!bodyString) {
        throw new Error('Empty config file');
      }

      const config = JSON.parse(bodyString);
      console.log(`Loaded ${config.autoStartSchedules?.length || 0} schedules`);
      
      return config;
    } catch (error) {
      console.error('Error loading config from S3:', error);
      throw error;
    }
  }
}
