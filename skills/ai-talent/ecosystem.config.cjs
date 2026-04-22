// PM2 process config for Marketing-OS (ai-talent skill).
//
// Secrets have been removed from this file (see issue #1). Runtime env now comes
// from `.env` or Doppler; PM2 inherits the shell env. When launching locally:
//
//   set -a && source .env && set +a
//   pm2 start ecosystem.config.cjs --update-env
//
// See docs/runbooks/secret-rotation.md for the full secret-management flow.
//
// wait_ready + listen_timeout (issue #14):
//   PM2 holds traffic until the server calls process.send('ready'). The server
//   sends 'ready' after runReadinessChecks() passes for the first time at boot.
//   listen_timeout is 30 s; if 'ready' is not received in time PM2 kills the
//   instance and retries (up to max_restarts), preventing partially-initialized
//   instances from receiving traffic.

module.exports = {
  apps: [{
    name: 'marketing-os',
    script: './node_modules/.bin/tsx',
    args: 'server/index.ts',
    cwd: '/home/azureuser/marketing-os/skills/ai-talent',
    instances: 1,
    exec_mode: 'fork',
    max_restarts: 10,
    restart_delay: 5000,
    max_memory_restart: '512M',
    // Readiness gate — PM2 waits for process.send('ready') before routing
    // traffic. Server sends it after /ready passes once at startup (issue #14).
    wait_ready:     true,
    listen_timeout: 30000, // 30 s — enough for DB/Redis/migrations to stabilise
    // No literal secrets. Everything the app needs is read via process.env at
    // runtime; env.ts (zod-validated) will fail fast if anything required is missing.
    env: {
      NODE_ENV: 'production',
    },
    error_file: '/home/azureuser/logs/marketing-os-error.log',
    out_file: '/home/azureuser/logs/marketing-os-out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    autorestart: true,
    watch: false,
  }]
};
