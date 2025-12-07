"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3Service = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
class S3Service {
    constructor(region = 'us-east-1') {
        this.client = new client_s3_1.S3Client({ region });
    }
    async getConfig(bucket, key) {
        try {
            console.log(`Loading config from s3://${bucket}/${key}`);
            const command = new client_s3_1.GetObjectCommand({
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
        }
        catch (error) {
            console.error('Error loading config from S3:', error);
            throw error;
        }
    }
}
exports.S3Service = S3Service;
