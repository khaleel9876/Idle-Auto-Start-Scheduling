# Idle-Auto-Start-Scheduling

Step-by-Step Implementation
Step 1: Install Prerequisites
First, let's install Node.js and other required tools
For Amazon Linux 2 / CentOS / RHEL:
bash
# Install Node.js 18.x
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# verify installation
node --version  
npm --version  

# Install AWS CLI (if not already installed)
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Verify AWS CLI
aws –version
Step 1: Project Setup
bash
# Create project structure
mkdir vm-autostart-lambda
cd vm-autostart-lambda

# Initialize Node.js project
npm init -y

# Install dependencies
npm install @aws-sdk/client-ec2 \
            @aws-sdk/client-s3 \
            @aws-sdk/client-ses \
            cron-parser \
            typescript \
            @types/node \
            @types/aws-lambda

# Install dev dependencies
npm install -D @types/node typescript esbuild
Step 2: Create Typescript Configuration
File: tsconfig.json
json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node",
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
Step 3: Project Structure
vm-autostart-lambda/
├── src/
│   ├── handlers/
│   │   └── autoStartHandler.ts          
│   ├── services/
│   │   ├── scheduleParser.ts            
│   │   ├── ec2Service.ts                
│   │   ├── s3Service.ts                 
│   │   └── emailService.ts              
│   ├── types/
│   │   └── index.ts                     
│   └── config/
│       └── settings.json                
├── template.yaml                         
├── package.json
└── tsconfig.json
Step 4: Implement Core Services
File: src/types/index.ts
typescript
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
File: src/services/scheduleParser.ts
typescript
import { AutoStartSchedule } from '../types';

export class ScheduleParser {
  constructor(private schedules: AutoStartSchedule[]) {
    this.validateSchedules();
  }

  private validateSchedules(): void {
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
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Invalid schedule at index ${index}: ${errorMessage}`);
      }
    });
  }

  getSchedulesToRun(currentTime: Date = new Date()): AutoStartSchedule[] {
    const cronParser = require('cron-parser');
    const parser = cronParser.CronExpressionParser || cronParser.default;
    
    return this.schedules.filter(schedule => {
      if (schedule.enabled === false) return false;

      try {
        const interval = parser.parse(schedule.cron, {
          currentDate: currentTime,
          tz: schedule.timezone || 'UTC'
        });
        
        const nextRun = interval.prev().toDate();
        const timeDiff = Math.abs(currentTime.getTime() - nextRun.getTime());
        
        // Run if within 1 minute of scheduled time
        return timeDiff < 60000;
      } catch (error) {
        console.error(`Error parsing schedule for ${schedule.instanceId}:`, error);
        return false;
      }
    });
  }
}
File: src/services/ec2Service.ts
typescript
import { 
  EC2Client, 
  StartInstancesCommand, 
  DescribeInstancesCommand,
  InstanceStateName 
} from '@aws-sdk/client-ec2';
import { StartResult } from '../types';

export class EC2Service {
  private clients: Map<string, EC2Client> = new Map();
  private readonly maxRetries = 3;
  private readonly retryDelay = 5000;

  private getClient(region: string): EC2Client {
    if (!this.clients.has(region)) {
      this.clients.set(region, new EC2Client({ region }));
    }
    return this.clients.get(region)!;
  }

  async startInstance(instanceId: string, region: string): Promise<StartResult> {
    const startTime = new Date();
    const client = this.getClient(region);

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`[${region}] Starting instance ${instanceId} (Attempt ${attempt}/${this.maxRetries})`);
        
        // Check current state
        const describeCommand = new DescribeInstancesCommand({
          InstanceIds: [instanceId]
        });
        
        const describeResponse = await client.send(describeCommand);
        const instance = describeResponse.Reservations?.[0]?.Instances?.[0];
        
        if (!instance) {
          throw new Error(`Instance ${instanceId} not found in region ${region}`);
        }

        const previousState = instance.State?.Name || 'unknown';
        
        if (previousState === InstanceStateName.running) {
          console.log(`[${region}] Instance ${instanceId} is already running`);
          return {
            instanceId,
            region,
            success: true,
            startTime,
            duration: Date.now() - startTime.getTime(),
            previousState,
            currentState: 'running'
          };
        }

        if (previousState === InstanceStateName.terminated) {
          throw new Error('Cannot start terminated instance');
        }

        // Start the instance
        const startCommand = new StartInstancesCommand({
          InstanceIds: [instanceId]
        });
        
        const startResponse = await client.send(startCommand);
        const currentState = startResponse.StartingInstances?.[0]?.CurrentState?.Name || 'unknown';
        
        console.log(`[${region}] Successfully started instance ${instanceId}`);
        
        return {
          instanceId,
          region,
          success: true,
          startTime,
          duration: Date.now() - startTime.getTime(),
          previousState,
          currentState
        };
        
      } catch (error) {
        console.error(`[${region}] Error starting instance ${instanceId} (Attempt ${attempt}):`, error);
        
        if (attempt === this.maxRetries) {
          return {
            instanceId,
            region,
            success: false,
            error: error.message,
            startTime
          };
        }
        
        await this.sleep(this.retryDelay * attempt);
      }
    }

    return {
      instanceId,
      region,
      success: false,
      error: 'Max retries reached',
      startTime
    };
  }

  async startMultipleInstances(
    instances: Array<{ instanceId: string; region: string }>
  ): Promise<StartResult[]> {
    const results = await Promise.allSettled(
      instances.map(({ instanceId, region }) =>
        this.startInstance(instanceId, region)
      )
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          instanceId: instances[index].instanceId,
          region: instances[index].region,
          success: false,
          error: result.reason?.message || 'Unknown error',
          startTime: new Date()
        };
      }
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
File: src/services/s3Service.ts
typescript
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
File: src/services/emailService.ts
typescript
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { StartResult } from '../types';

export class EmailService {
  private client: SESClient;

  constructor(
    private fromEmail: string,
    private toEmail: string,
    region: string = 'us-east-1'
  ) {
    this.client = new SESClient({ region });
  }

  async sendSummary(results: StartResult[]): Promise<void> {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    const htmlContent = this.generateHtmlContent(results, successful, failed);

    const command = new SendEmailCommand({
      Source: this.fromEmail,
      Destination: {
        ToAddresses: [this.toEmail]
      },
      Message: {
        Subject: {
          Data: `VM Auto-Start Summary - ${successful.length} started, ${failed.length} failed`
        },
        Body: {
          Html: {
            Data: htmlContent
          }
        }
      }
    });

    try {
      await this.client.send(command);
      console.log('Summary email sent successfully');
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  private generateHtmlContent(
    results: StartResult[],
    successful: StartResult[],
    failed: StartResult[]
  ): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { background-color: #FF9900; color: white; padding: 20px; text-align: center; }
    .summary { background-color: #f4f4f4; padding: 15px; margin: 20px 0; border-radius: 5px; }
    .instance { background-color: white; padding: 15px; margin: 10px 0; border-left: 4px solid #4CAF50; }
    .instance.failed { border-left-color: #f44336; }
    .label { font-weight: bold; color: #666; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>EC2 Auto-Start Summary</h1>
      <p>${new Date().toLocaleString()}</p>
    </div>

    <div class="summary">
      <h2>Summary</h2>
      <p><span class="label">Total Scheduled:</span> ${results.length}</p>
      <p><span class="label">Successful:</span> ${successful.length}</p>
      <p><span class="label">Failed:</span> ${failed.length}</p>
    </div>

    ${successful.length > 0 ? `
      <h2>✅ Successfully Started</h2>
      ${successful.map(r => `
        <div class="instance">
          <p><span class="label">Instance ID:</span> ${r.instanceId}</p>
          <p><span class="label">Region:</span> ${r.region}</p>
          <p><span class="label">Previous State:</span> ${r.previousState}</p>
          <p><span class="label">Current State:</span> ${r.currentState}</p>
          <p><span class="label">Started at:</span> ${r.startTime.toLocaleString()}</p>
          ${r.duration ? `<p><span class="label">Duration:</span> ${(r.duration / 1000).toFixed(2)}s</p>` : ''}
        </div>
      `).join('')}
    ` : ''}

    ${failed.length > 0 ? `
      <h2> Failed to Start</h2>
      ${failed.map(r => `
        <div class="instance failed">
          <p><span class="label">Instance ID:</span> ${r.instanceId}</p>
          <p><span class="label">Region:</span> ${r.region}</p>
          <p><span class="label">Error:</span> ${r.error || 'Unknown error'}</p>
        </div>
      `).join('')}
    ` : ''}

    <div class="footer">
      <p>This is an automated message from your EC2 Auto-Start System</p>
      <p>Powered by AWS Lambda</p>
    </div>
  </div>
</body>
</html>
    `;
  }
}
File: src/handlers/autoStartHandler.ts
typescript
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
Step 5: Create Configuration File
File: src/config/settings.json
json
{
  "autoStartSchedules": [
    {
      "provider": "aws",
      "instanceId": "i-0123456789abcdef0",
      "region": "us-east-1",
      "cron": "0 9 * * MON-FRI",
      "enabled": true,
      "timezone": "America/New_York",
      "name": "Production Web Server",
      "tags": {
        "environment": "production",
        "team": "backend"
      }
    },
    {
      "provider": "aws",
      "instanceId": "i-abcdef0123456789",
      "region": "us-west-2",
      "cron": "0 8 * * MON-FRI",
      "enabled": true,
      "timezone": "America/Los_Angeles",
      "name": "Dev Database Server"
    }
  ]
}
Step 6: AWS SAM Template
File: template.yaml
yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: EC2 Auto-Start Lambda Function

Parameters:
  ConfigBucket:
    Type: String
    Description: S3 bucket containing configuration
  FromEmail:
    Type: String
    Description: SES verified sender email
  ToEmail:
    Type: String
    Description: Email recipient for notifications

Globals:
  Function:
    Timeout: 300
    Runtime: nodejs18.x
    MemorySize: 256

Resources:
  AutoStartFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: dist/
      Handler: handlers/autoStartHandler.handler
      Environment:
        Variables:
          CONFIG_BUCKET: !Ref ConfigBucket
          CONFIG_KEY: config/settings.json
          FROM_EMAIL: !Ref FromEmail
          TO_EMAIL: !Ref ToEmail
      Policies:
        - Statement:
            - Effect: Allow
              Action:
                - ec2:StartInstances
                - ec2:DescribeInstances
              Resource: '*'
            - Effect: Allow
              Action:
                - s3:GetObject
              Resource: !Sub 'arn:aws:s3:::${ConfigBucket}/*'
            - Effect: Allow
              Action:
                - ses:SendEmail
              Resource: '*'
      Events:
        ScheduleEvent:
          Type: Schedule
          Properties:
            Schedule: 'rate(5 minutes)'
            Description: Run auto-start check every 5 minutes
            Enabled: true

Outputs:
  AutoStartFunctionArn:
    Description: Auto-Start Lambda Function ARN
    Value: !GetAtt AutoStartFunction.Arn
Step 7: Build Script
File: package.json
json
{
  "name": "ec2-autostart-lambda",
  "version": "1.0.0",
  "scripts": {
    "build": "tsc && npm run bundle",
    "bundle": "esbuild src/handlers/autoStartHandler.ts --bundle --platform=node --target=node18 --outfile=dist/handlers/autoStartHandler.js --external:@aws-sdk/*",
    "deploy": "npm run build && sam deploy --guided",
    "local": "sam local invoke AutoStartFunction --event events/test-event.json"
  }
}
Step 8: Deployment Steps
bash
# 1. Build the project
npm run build

# 2. Create S3 bucket for config
aws s3 mb s3://my-vm-autostart-config

# 3. Upload configuration
aws s3 cp src/config/settings.json s3://my-vm-autostart-config/config/settings.json

# 4. Verify SES email (if not already done)
aws ses verify-email-identity –khaleeldev12@gmail.com.com

# 5. Deploy with SAM
sam build
sam deploy --guided

# Follow prompts:
# - Stack Name: ec2-autostart
# - AWS Region: us-east-1
# - ConfigBucket: my-vm-autostart-config
# - FromEmail: your-email@example.com
# - ToEmail: your-email@example.com
# - Confirm changes: Y
# - Allow SAM CLI IAM role creation: Y
Step 9: Alternative - Manual Lambda Deployment (Without SAM)
bash
# 1. Build
npm run build

# 2. Create ZIP
cd dist
zip -r ../function.zip .
cd ..

# 3. Create IAM role
aws iam create-role \
  --role-name ec2-autostart-lambda-role \
  --assume-role-policy-document file://trust-policy.json

# 4. Attach policies
aws iam attach-role-policy \
  --role-name ec2-autostart-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

aws iam put-role-policy \
  --role-name ec2-autostart-lambda-role \
  --policy-name EC2StartPolicy \
  --policy-document file://ec2-policy.json

# 5. Create Lambda function
aws lambda create-function \
  --function-name ec2-autostart \
  --runtime nodejs18.x \
  --role arn:aws:iam::ACCOUNT_ID:role/ec2-autostart-lambda-role \
  --handler handlers/autoStartHandler.handler \
  --zip-file fileb://function.zip \
  --timeout 300 \
  --memory-size 256 \
  --environment Variables="{CONFIG_BUCKET=my-vm-autostart-config,CONFIG_KEY=config/settings.json,FROM_EMAIL=your-email@example.com,TO_EMAIL=your-email@example.com}"

# 6. Create EventBridge rule
aws events put-rule \
  --name ec2-autostart-schedule \
  --schedule-expression "rate(5 minutes)"

# 7. Add Lambda permission
aws lambda add-permission \
  --function-name ec2-autostart \
  --statement-id AllowEventBridge \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn arn:aws:events:REGION:ACCOUNT_ID:rule/ec2-autostart-schedule

# 8. Add target to EventBridge rule
aws events put-targets \
  --rule ec2-autostart-schedule \
  --targets "Id"="1","Arn"="arn: aws: lambda: REGION: ACCOUNT_ID:function:ec2-autostart"
Testing
Test Locally with SAM
bash
# Create test event
cat > events/test-event.json << 'EOF'
{
  "version": "0",
  "id": "test-event",
  "detail-type": "Scheduled Event",
  "source": "aws.events",
  "time": "2025-01-15T09:00:00Z"
}
EOF

# Test locally
sam local invoke AutoStartFunction --event events/test-event.json
Monitor Lambda
bash
# View logs
aws logs tail /aws/lambda/ec2-autostart --follow

# Check recent invocations
aws lambda get-function --function-name ec2-autostart

