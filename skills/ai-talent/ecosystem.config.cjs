module.exports = {
  apps: [{
    name: 'sowork-enterprise',
    script: './node_modules/.bin/tsx',
    args: 'server/index.ts',
    cwd: '/home/azureuser/sowork-marketing-enterprise/skills/ai-talent',
    instances: 1,
    exec_mode: 'fork',
    max_restarts: 10,
    restart_delay: 5000,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT: '3101',
      TRUST_PROXY: '1',
    },
    error_file: '/home/azureuser/logs/sowork-enterprise-error.log',
    out_file: '/home/azureuser/logs/sowork-enterprise-out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    autorestart: true,
    watch: false,
    // NOTE: DB_PASSWORD, JWT_SECRET, and other secrets must be set in the
    // VM-local ecosystem.config.cjs env block — never commit secrets to repo.
  }]
};
