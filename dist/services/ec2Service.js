"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EC2Service = void 0;
const client_ec2_1 = require("@aws-sdk/client-ec2");
class EC2Service {
    constructor() {
        this.clients = new Map();
        this.maxRetries = 3;
        this.retryDelay = 5000;
    }
    getClient(region) {
        if (!this.clients.has(region)) {
            this.clients.set(region, new client_ec2_1.EC2Client({ region }));
        }
        return this.clients.get(region);
    }
    async startInstance(instanceId, region) {
        const startTime = new Date();
        const client = this.getClient(region);
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                console.log(`[${region}] Starting instance ${instanceId} (Attempt ${attempt}/${this.maxRetries})`);
                const describeCommand = new client_ec2_1.DescribeInstancesCommand({
                    InstanceIds: [instanceId]
                });
                const describeResponse = await client.send(describeCommand);
                const instance = describeResponse.Reservations?.[0]?.Instances?.[0];
                if (!instance) {
                    throw new Error(`Instance ${instanceId} not found in region ${region}`);
                }
                const previousState = instance.State?.Name || 'unknown';
                if (previousState === client_ec2_1.InstanceStateName.running) {
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
                if (previousState === client_ec2_1.InstanceStateName.terminated) {
                    throw new Error('Cannot start terminated instance');
                }
                const startCommand = new client_ec2_1.StartInstancesCommand({
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
            }
            catch (error) {
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
    async startMultipleInstances(instances) {
        const results = await Promise.allSettled(instances.map(({ instanceId, region }) => this.startInstance(instanceId, region)));
        return results.map((result, index) => {
            if (result.status === 'fulfilled') {
                return result.value;
            }
            else {
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
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.EC2Service = EC2Service;
