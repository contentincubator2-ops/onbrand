/**
 * PM2 process config for the VM deploy.
 *
 * SECRETS MUST NOT LIVE HERE.
 *
 * Earlier versions of this file inlined DB_PASSWORD, OPENROUTER_API_KEY,
 * AZURE_FOUNDRY_API_KEY, GOOGLE_AI_API_KEY, JWT_SECRET, etc. directly.
 * Anyone with read access to the repo (including past clones) has those
 * values — git history can't be untrained, so those credentials need to
 * be **rotated** independently of this commit. See docs/SECRETS-ROTATION.md.
 *
 * Going forward: every secret comes from process.env at PM2 spawn time.
 * On the VM, populate /home/azureuser/marketing-os/skills/ai-talent/.env
 * and source it before `pm2 start ecosystem.config.cjs --update-env`,
 * or set them in /etc/environment for system-wide pickup.
 */
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
    // Only non-secret defaults live here. Everything sensitive is read
    // from process.env (the VM's .env / shell env).
    env: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || '3101',
      TRUST_PROXY: '1',
      SKILLS_PATH: process.env.SKILLS_PATH || '/home/azureuser/A2A-Marketing-Claw/skills',

      // Azure MySQL (read from env)
      DB_HOST: process.env.DB_HOST,
      DB_PORT: process.env.DB_PORT || '3306',
      DB_USER: process.env.DB_USER,
      DB_PASSWORD: process.env.DB_PASSWORD,
      DB_NAME: process.env.DB_NAME,
      DB_SSL: process.env.DB_SSL || 'true',

      // VM-local MySQL (read from env)
      LOCAL_DB_HOST: process.env.LOCAL_DB_HOST || 'localhost',
      LOCAL_DB_PORT: process.env.LOCAL_DB_PORT || '3306',
      LOCAL_DB_USER: process.env.LOCAL_DB_USER,
      LOCAL_DB_PASSWORD: process.env.LOCAL_DB_PASSWORD,
      LOCAL_DB_NAME: process.env.LOCAL_DB_NAME || 'mos_db',

      // Auth secrets
      JWT_SECRET: process.env.JWT_SECRET,
      SESSION_SECRET: process.env.SESSION_SECRET,

      // LLM providers
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY,
      GOOGLE_GEMINI_API_KEY: process.env.GOOGLE_GEMINI_API_KEY,
      AZURE_FOUNDRY_API_KEY: process.env.AZURE_FOUNDRY_API_KEY,
      AZURE_FOUNDRY_PROJECT_ENDPOINT: process.env.AZURE_FOUNDRY_PROJECT_ENDPOINT,
      AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT,
    },
    error_file: '/home/azureuser/logs/marketing-os-error.log',
    out_file: '/home/azureuser/logs/marketing-os-out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    autorestart: true,
    watch: false,
  }]
};
