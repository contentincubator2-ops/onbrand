import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

/**
 * Default retry options applied to every job on every queue.
 * Callers may override per-add, but this sets the floor.
 */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 2000 },
} as const;

export const marketingQueue = new Queue('marketing-jobs', {
  connection,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

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
