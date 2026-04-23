import { Queue } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';

// Lazy-init so importing this module doesn't open a Redis connection at
// cold start. On Vercel, top-level side effects run on every invocation;
// connection should happen only when a handler actually needs the queue.
let _connection: Redis | null = null;
let _queue: Queue | null = null;

export function getConnection(): Redis {
  if (_connection) return _connection;
  _connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
  return _connection;
}

export function getMarketingQueue(): Queue {
  if (_queue) return _queue;
  _queue = new Queue('marketing-jobs', { connection: getConnection() });
  return _queue;
}

// Backwards-compat proxies — preserves existing `import { connection, marketingQueue }`
// callsites while deferring connection until first property access.
export const connection: Redis = new Proxy({} as Redis, {
  get(_t, prop) {
    const c = getConnection() as unknown as Record<PropertyKey, unknown>;
    const value = c[prop];
    return typeof value === 'function' ? (value as Function).bind(c) : value;
  },
});

export const marketingQueue: Queue = new Proxy({} as Queue, {
  get(_t, prop) {
    const q = getMarketingQueue() as unknown as Record<PropertyKey, unknown>;
    const value = q[prop];
    return typeof value === 'function' ? (value as Function).bind(q) : value;
  },
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
