# Secrets Rotation Required

> Status: **rotation required** as of commit removing inlined secrets from `ecosystem.config.cjs`.

`skills/ai-talent/ecosystem.config.cjs` previously hardcoded production credentials
directly in the repo. Even after removal in the latest commit, anyone with read
access to the repo's git history (including past clones, forks, GitHub mirrors,
CI logs) can recover the values. **Removing them from the file does NOT remove
them from history.**

## What needs rotating

| Credential | Where it appeared | Action |
|---|---|---|
| `DB_PASSWORD` (Azure MySQL `openclaw`) | ecosystem.config.cjs | Rotate in Azure portal → update VM env + Vercel env |
| `LOCAL_DB_PASSWORD` (VM `mos_user`) | ecosystem.config.cjs | Rotate via `ALTER USER` on the VM MySQL → update VM env |
| `JWT_SECRET` | ecosystem.config.cjs | Rotate; existing user sessions invalidated (forces re-login) |
| `SESSION_SECRET` | ecosystem.config.cjs | Same as JWT_SECRET |
| `OPENROUTER_API_KEY` | ecosystem.config.cjs | Rotate at openrouter.ai/keys |
| `GOOGLE_AI_API_KEY` / `GOOGLE_GEMINI_API_KEY` | ecosystem.config.cjs | Rotate at console.cloud.google.com |
| `AZURE_FOUNDRY_API_KEY` | ecosystem.config.cjs | Rotate in Azure AI Foundry portal |

## Where to put the new values

### VM (PM2 deploy)
1. SSH to VM: `ssh azureuser@<VM_HOST>`
2. Edit `/home/azureuser/marketing-os/skills/ai-talent/.env` (already in `.gitignore`).
   Use the same KEY=VALUE format as `.env.example`.
3. Restart: `set -a; source .env; set +a; pm2 restart marketing-os --update-env`

### Vercel
Per-environment via dashboard or CLI:
```bash
vercel env rm <KEY> production --yes && \
vercel env add <KEY> production --value '<new-value>' --yes
```
Then `vercel --prod --yes` to redeploy with new values picked up.

### GitHub Actions (`.github/workflows/admin-deploy.yml`)
Repo Settings → Secrets and variables → Actions → update `VM_SSH_*` and any
`*_API_KEY` secrets that the workflow injects.

## How to verify rotation worked

After updating each provider:

```bash
# DB
mysql -h <host> -u <user> -p<NEW> -e "SELECT 1"

# OpenRouter
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "authorization: Bearer <NEW_OPENROUTER_KEY>" \
  https://openrouter.ai/api/v1/models

# Azure Foundry
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "authorization: Bearer <NEW_AZURE_FOUNDRY_KEY>" \
  "$AZURE_FOUNDRY_PROJECT_ENDPOINT/openai/v1/models"

# Vercel function picks them up
curl -s https://marketing-os-eta.vercel.app/health
# expect db: connected
```

## Why we didn't `git rebase` to drop the bad commit

- `ecosystem.config.cjs` has been pushed to `main` for weeks; clones already exist.
- Rewriting history breaks every active branch and everyone's `git pull`.
- Rotating the underlying credentials is faster, simpler, and the only path that
  actually removes the threat. The bad commits stay in history for reference.

## Going forward

- `.gitignore` already excludes `.env`, `.env.local`, `.env.prod`. Don't add real
  values to `.env.example` — that file IS tracked.
- Pre-commit hook to grep for `password|api_key|secret\s*=\s*['"][a-zA-Z0-9]` is
  worth adding (separate task).
