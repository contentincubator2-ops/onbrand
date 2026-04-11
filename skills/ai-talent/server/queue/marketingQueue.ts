import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const marketingQueue = new Queue('marketing-jobs', { connection });

export interface MarketingJobData {
  jobId: string;
  userRequest: string;
  brand?: string;
  industry?: string;
  taskType?: string;
  userId?: number;
}

export interface MarketingJobResult {
  agent: { name: string; title: string; taskType: string };
  model: string;
  thinking: string;
  publishable_content: string;
  metadata?: Record<string, unknown>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens?: number };
}
