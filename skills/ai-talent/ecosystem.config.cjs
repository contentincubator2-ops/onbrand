module.exports = {
  apps: [{
    name: 'marketing-os',
    script: './node_modules/.bin/tsx',
    args: 'server/index.ts',
    cwd: '/home/azureuser/marketing-os/skills/ai-talent',
    // 2026-05-14: cluster mode for 100-user trial scale. 2 workers use
    // 2 cores; node event loop is no longer the single choke point under
    // burst LLM traffic. See .github/workflows/admin-pm2-cluster-mode.yml
    // for caveats (per-worker in-memory rate limiters / OAuth state).
    instances: 2,
    exec_mode: 'cluster',
    max_restarts: 10,
    restart_delay: 5000,
    max_memory_restart: '768M',
    env: {
      NODE_ENV: 'production',
      SKILLS_PATH: '/home/azureuser/A2A-Marketing-Claw/skills',
      PORT: process.env.PORT || '3101',
      TRUST_PROXY: process.env.TRUST_PROXY || '1',
      // 2026-05-13 (pre-launch security review): every secret moved
      // to env. Historical commits still contain the old values — they
      // MUST be rotated externally:
      //   · Azure MySQL prod (DB_PASSWORD)
      //   · JWT_SECRET (any signed token is forgeable until rotated)
      //   · SESSION_SECRET
      //   · OpenRouter, Azure Foundry, Google AI API keys
      // Server reads from /opt/marketing-os/app/skills/ai-talent/.env
      // via dotenv (loaded in server/index.ts bootstrap-env block).
      // pm2 inherits process env when this file's env block is empty.
    },
    error_file: '/home/azureuser/logs/marketing-os-error.log',
    out_file: '/home/azureuser/logs/marketing-os-out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    autorestart: true,
    watch: false,
  }]
};
