#!/usr/bin/env node
// Batch embed all agents using text-embedding-3-large (3072 dims)
// Usage: node embed_agents.cjs
//
// Requires the following env vars (set via .env / Doppler — never committed):
//   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
//   AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY
//   AZURE_OPENAI_EMBEDDING_DEPLOYMENT (optional, defaults to text-embedding-3-large)

const mysql = require('mysql2/promise');
const https = require('https');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`[embed] Missing required env var: ${name}`);
    console.error(`[embed] Load your .env (e.g. \`set -a && source .env && set +a\`) then retry.`);
    process.exit(1);
  }
  return v;
}

const DB_CONFIG = {
  host:     requireEnv('DB_HOST'),
  port:     parseInt(process.env.DB_PORT || '3306', 10),
  user:     requireEnv('DB_USER'),
  password: requireEnv('DB_PASSWORD'),
  database: requireEnv('DB_NAME'),
  ssl: (process.env.DB_SSL ?? 'true') === 'true' ? { rejectUnauthorized: false } : undefined,
};

const AZURE_ENDPOINT = requireEnv('AZURE_OPENAI_ENDPOINT').replace(/\/+$/, '');
const AZURE_KEY      = requireEnv('AZURE_OPENAI_API_KEY');
const DEPLOYMENT     = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || 'text-embedding-3-large';
const BATCH_SIZE = 20;
const DELAY_MS = 500; // rate limit buffer

async function embedTexts(texts) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ input: texts });
    const url = new URL(`${AZURE_ENDPOINT}/openai/deployments/${DEPLOYMENT}/embeddings?api-version=2024-02-01`);
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'api-key': AZURE_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.data) resolve(json.data.map(d => d.embedding));
          else reject(new Error(JSON.stringify(json.error)));
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const conn = await mysql.createConnection(DB_CONFIG);
  console.log('[embed] DB connected');

  // Clear old embeddings (wrong dims / old model)
  await conn.execute('TRUNCATE TABLE agent_embeddings');
  console.log('[embed] Cleared old embeddings');

  // Get all agents
  const [agents] = await conn.execute(
    `SELECT id, name, title, specialty, primarySkill, bio
     FROM agents WHERE isAvailable=1 ORDER BY id`
  );
  console.log(`[embed] Total agents: ${agents.length}`);

  let done = 0;
  const logFile = '/tmp/embed_progress.txt';
  require('fs').writeFileSync(logFile, `started: ${new Date().toISOString()}\ntotal: ${agents.length}\n`);

  for (let i = 0; i < agents.length; i += BATCH_SIZE) {
    const batch = agents.slice(i, i + BATCH_SIZE);
    const texts = batch.map(a => {
      const parts = [a.title, a.name, a.specialty, a.primarySkill, a.bio].filter(Boolean);
      return parts.join(' | ').slice(0, 1000);
    });

    try {
      const embeddings = await embedTexts(texts);
      for (let j = 0; j < batch.length; j++) {
        const agent = batch[j];
        const embStr = JSON.stringify(embeddings[j]);
        await conn.execute(
          `INSERT INTO agent_embeddings (agent_id, embed_text, embedding, embed_model)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE embedding=VALUES(embedding), embed_model=VALUES(embed_model), updated_at=NOW()`,
          [agent.id, texts[j].slice(0, 500), embStr, DEPLOYMENT]
        );
      }
      done += batch.length;
      if (done % 200 === 0 || done === agents.length) {
        const pct = Math.round(done / agents.length * 100);
        const msg = `[embed] ${done}/${agents.length} (${pct}%) - ${new Date().toISOString()}`;
        console.log(msg);
        require('fs').appendFileSync(logFile, msg + '\n');
      }
    } catch(err) {
      console.error(`[embed] BATCH ERR at i=${i}:`, err.message);
      require('fs').appendFileSync(logFile, `ERROR at ${i}: ${err.message}\n`);
      // retry after longer delay
      await new Promise(r => setTimeout(r, 3000));
      i -= BATCH_SIZE; // retry same batch
      continue;
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log('[embed] DONE:', done, 'agents embedded');
  require('fs').appendFileSync(logFile, `DONE: ${done} at ${new Date().toISOString()}\n`);
  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });
