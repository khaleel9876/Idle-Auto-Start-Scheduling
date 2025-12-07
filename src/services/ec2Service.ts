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
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[${region}] Error starting instance ${instanceId} (Attempt ${attempt}):`, errorMessage);
        
        if (attempt === this.maxRetries) {
          return {
            instanceId,
            region,
            success: false,
            error: errorMessage,
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
        const errorMessage = result.reason instanceof Error ? result.reason.message : 'Unknown error';
        return {
          instanceId: instances[index].instanceId,
          region: instances[index].region,
          success: false,
          error: errorMessage,
          startTime: new Date()
        };
      }
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
