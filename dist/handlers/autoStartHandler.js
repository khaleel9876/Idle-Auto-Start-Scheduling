"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/handlers/autoStartHandler.ts
var autoStartHandler_exports = {};
__export(autoStartHandler_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(autoStartHandler_exports);

// src/services/scheduleParser.ts
var ScheduleParser = class {
  constructor(schedules) {
    this.schedules = schedules;
    this.validateSchedules();
  }
  validateSchedules() {
    this.schedules.forEach((schedule, index) => {
      try {
        const cronParser = require("cron-parser");
        const parser = cronParser.CronExpressionParser || cronParser.default;
        parser.parse(schedule.cron);
        if (!schedule.instanceId) {
          throw new Error("instanceId is required");
        }
        if (!schedule.region) {
          throw new Error("region is required");
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        throw new Error(`Invalid schedule at index ${index}: ${errorMessage}`);
      }
    });
  }
  getSchedulesToRun(currentTime = /* @__PURE__ */ new Date()) {
    const cronParser = require("cron-parser");
    const parser = cronParser.CronExpressionParser || cronParser.default;
    return this.schedules.filter((schedule) => {
      if (schedule.enabled === false) return false;
      try {
        const interval = parser.parse(schedule.cron, {
          currentDate: currentTime,
          tz: schedule.timezone || "UTC"
        });
        const nextRun = interval.prev().toDate();
        const timeDiff = Math.abs(currentTime.getTime() - nextRun.getTime());
        return timeDiff < 6e4;
      } catch (error) {
        console.error(`Error parsing schedule for ${schedule.instanceId}:`, error);
        return false;
      }
    });
  }
};

// src/services/ec2Service.ts
var import_client_ec2 = require("@aws-sdk/client-ec2");
var EC2Service = class {
  constructor() {
    this.clients = /* @__PURE__ */ new Map();
    this.maxRetries = 3;
    this.retryDelay = 5e3;
  }
  getClient(region) {
    if (!this.clients.has(region)) {
      this.clients.set(region, new import_client_ec2.EC2Client({ region }));
    }
    return this.clients.get(region);
  }
  async startInstance(instanceId, region) {
    const startTime = /* @__PURE__ */ new Date();
    const client = this.getClient(region);
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`[${region}] Starting instance ${instanceId} (Attempt ${attempt}/${this.maxRetries})`);
        const describeCommand = new import_client_ec2.DescribeInstancesCommand({
          InstanceIds: [instanceId]
        });
        const describeResponse = await client.send(describeCommand);
        const instance = describeResponse.Reservations?.[0]?.Instances?.[0];
        if (!instance) {
          throw new Error(`Instance ${instanceId} not found in region ${region}`);
        }
        const previousState = instance.State?.Name || "unknown";
        if (previousState === import_client_ec2.InstanceStateName.running) {
          console.log(`[${region}] Instance ${instanceId} is already running`);
          return {
            instanceId,
            region,
            success: true,
            startTime,
            duration: Date.now() - startTime.getTime(),
            previousState,
            currentState: "running"
          };
        }
        if (previousState === import_client_ec2.InstanceStateName.terminated) {
          throw new Error("Cannot start terminated instance");
        }
        const startCommand = new import_client_ec2.StartInstancesCommand({
          InstanceIds: [instanceId]
        });
        const startResponse = await client.send(startCommand);
        const currentState = startResponse.StartingInstances?.[0]?.CurrentState?.Name || "unknown";
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
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
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
      error: "Max retries reached",
      startTime
    };
  }
  async startMultipleInstances(instances) {
    const results = await Promise.allSettled(
      instances.map(
        ({ instanceId, region }) => this.startInstance(instanceId, region)
      )
    );
    return results.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      } else {
        const errorMessage = result.reason instanceof Error ? result.reason.message : "Unknown error";
        return {
          instanceId: instances[index].instanceId,
          region: instances[index].region,
          success: false,
          error: errorMessage,
          startTime: /* @__PURE__ */ new Date()
        };
      }
    });
  }
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
};

// src/services/s3Service.ts
var import_client_s3 = require("@aws-sdk/client-s3");
var S3Service = class {
  constructor(region = "us-east-1") {
    this.client = new import_client_s3.S3Client({ region });
  }
  async getConfig(bucket, key) {
    try {
      console.log(`Loading config from s3://${bucket}/${key}`);
      const command = new import_client_s3.GetObjectCommand({
        Bucket: bucket,
        Key: key
      });
      const response = await this.client.send(command);
      const bodyString = await response.Body?.transformToString();
      if (!bodyString) {
        throw new Error("Empty config file");
      }
      const config = JSON.parse(bodyString);
      console.log(`Loaded ${config.autoStartSchedules?.length || 0} schedules`);
      return config;
    } catch (error) {
      console.error("Error loading config from S3:", error);
      throw error;
    }
  }
};

// src/services/emailService.ts
var import_client_ses = require("@aws-sdk/client-ses");
var EmailService = class {
  constructor(fromEmail, toEmail, region = "us-east-1") {
    this.fromEmail = fromEmail;
    this.toEmail = toEmail;
    this.client = new import_client_ses.SESClient({ region });
  }
  async sendSummary(results) {
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);
    const htmlContent = this.generateHtmlContent(results, successful, failed);
    const command = new import_client_ses.SendEmailCommand({
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
      console.log("Summary email sent successfully");
    } catch (error) {
      console.error("Error sending email:", error);
      throw error;
    }
  }
  generateHtmlContent(results, successful, failed) {
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
      <h1>\u{1F680} EC2 Auto-Start Summary</h1>
      <p>${(/* @__PURE__ */ new Date()).toLocaleString()}</p>
    </div>

    <div class="summary">
      <h2>Summary</h2>
      <p><span class="label">Total Scheduled:</span> ${results.length}</p>
      <p><span class="label">\u2705 Successful:</span> ${successful.length}</p>
      <p><span class="label">\u274C Failed:</span> ${failed.length}</p>
    </div>

    ${successful.length > 0 ? `
      <h2>\u2705 Successfully Started</h2>
      ${successful.map((r) => `
        <div class="instance">
          <p><span class="label">Instance ID:</span> ${r.instanceId}</p>
          <p><span class="label">Region:</span> ${r.region}</p>
          <p><span class="label">Previous State:</span> ${r.previousState}</p>
          <p><span class="label">Current State:</span> ${r.currentState}</p>
          <p><span class="label">Started at:</span> ${r.startTime.toLocaleString()}</p>
          ${r.duration ? `<p><span class="label">Duration:</span> ${(r.duration / 1e3).toFixed(2)}s</p>` : ""}
        </div>
      `).join("")}
    ` : ""}

    ${failed.length > 0 ? `
      <h2>\u274C Failed to Start</h2>
      ${failed.map((r) => `
        <div class="instance failed">
          <p><span class="label">Instance ID:</span> ${r.instanceId}</p>
          <p><span class="label">Region:</span> ${r.region}</p>
          <p><span class="label">Error:</span> ${r.error || "Unknown error"}</p>
        </div>
      `).join("")}
    ` : ""}

    <div class="footer">
      <p>This is an automated message from your EC2 Auto-Start System</p>
      <p>Powered by AWS Lambda</p>
    </div>
  </div>
</body>
</html>
    `;
  }
};

// src/handlers/autoStartHandler.ts
var handler = async (event) => {
  console.log("Auto-start Lambda triggered at:", (/* @__PURE__ */ new Date()).toISOString());
  console.log("Event:", JSON.stringify(event, null, 2));
  try {
    const configBucket = process.env.CONFIG_BUCKET;
    const configKey = process.env.CONFIG_KEY || "config/settings.json";
    const fromEmail = process.env.FROM_EMAIL;
    const toEmail = process.env.TO_EMAIL;
    const region = process.env.AWS_REGION || "us-east-1";
    const s3Service = new S3Service(region);
    const config = await s3Service.getConfig(configBucket, configKey);
    const parser = new ScheduleParser(config.autoStartSchedules);
    const schedulesToRun = parser.getSchedulesToRun();
    if (schedulesToRun.length === 0) {
      console.log("No schedules to run at this time");
      return;
    }
    console.log(`Found ${schedulesToRun.length} schedules to execute`);
    const ec2Service = new EC2Service();
    const instances = schedulesToRun.map((s) => ({
      instanceId: s.instanceId,
      region: s.region
    }));
    const results = await ec2Service.startMultipleInstances(instances);
    const emailService = new EmailService(fromEmail, toEmail, region);
    await emailService.sendSummary(results);
    console.log("Auto-start execution completed");
    console.log(`Successful: ${results.filter((r) => r.success).length}`);
    console.log(`Failed: ${results.filter((r) => !r.success).length}`);
  } catch (error) {
    console.error("Error in auto-start handler:", error);
    throw error;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
