module.exports = {
  apps: [{
    name: 'ai-talent-dev',
    script: './node_modules/.bin/tsx',
    args: 'server/index.ts',
    cwd: require('path').resolve(__dirname),
    instances: 1,
    exec_mode: 'fork',
    max_restarts: 10,
    restart_delay: 2000,
    max_memory_restart: '1G',
    watch: [
      'server',
    ],
    watch_delay: 1000,
    ignore_watch: [
      'node_modules',
      'logs',
      'public',
      '.git',
      'client',
    ],
    env: {
      NODE_ENV: 'development',
      PORT: '3101',
      TRUST_PROXY: '0',
      ALLOW_DEV_AUTH: 'true',
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    autorestart: true,
    source_map_support: true,
  }]
};
