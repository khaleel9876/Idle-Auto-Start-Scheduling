"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const client_ses_1 = require("@aws-sdk/client-ses");
class EmailService {
    constructor(fromEmail, toEmail, region = 'us-east-1') {
        this.fromEmail = fromEmail;
        this.toEmail = toEmail;
        this.client = new client_ses_1.SESClient({ region });
    }
    async sendSummary(results) {
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);
        const htmlContent = this.generateHtmlContent(results, successful, failed);
        const command = new client_ses_1.SendEmailCommand({
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
        }
        catch (error) {
            console.error('Error sending email:', error);
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
      <h1>🚀 EC2 Auto-Start Summary</h1>
      <p>${new Date().toLocaleString()}</p>
    </div>

    <div class="summary">
      <h2>Summary</h2>
      <p><span class="label">Total Scheduled:</span> ${results.length}</p>
      <p><span class="label">✅ Successful:</span> ${successful.length}</p>
      <p><span class="label">❌ Failed:</span> ${failed.length}</p>
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
      <h2>❌ Failed to Start</h2>
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
exports.EmailService = EmailService;
