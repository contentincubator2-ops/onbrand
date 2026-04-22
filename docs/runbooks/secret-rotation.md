# Runbook: Secret rotation & Doppler migration

**Issue:** [#1 — Rotate all committed secrets + migrate to Doppler](https://github.com/contentincubator2-ops/Marketing-OS/issues/1)
**Severity:** P0 (security)
**Audience:** on-call engineer + ops lead.

This runbook covers:

1. What was leaked and why this PR does not — and cannot — finish the job alone.
2. The exact rotation sequence, per-provider.
3. The Doppler provisioning steps that turn `.env` from a single-host `source .env && set +a` flow into a centrally managed secret store.
4. Rollback.
5. A quick verification script to prove no literal secrets remain in HEAD.

> **⚠️ Manual steps are marked `[HUMAN]`.** CI cannot rotate a secret at its
> source — it can only stop bleeding and catch regressions. Every `[HUMAN]`
> step must be performed by an engineer with provider-console access.

---

## 1. What was committed (and is now in git history)

Up to commit `abb05e7`, the following production credentials lived in tracked files:

| Secret | File(s) | Commit to check |
|---|---|---|
| Azure MySQL password (`u40d…`) for `openclaw@ytcreator-ai-server` | `skills/ai-talent/embed_agents.cjs`, `skills/ai-talent/ecosystem.config.cjs` | any before this PR |
| Azure OpenAI API key (`FQV8…`) | `skills/ai-talent/embed_agents.cjs` | any before this PR |
| Azure Foundry key, Google Gemini key, OpenRouter key | `skills/ai-talent/ecosystem.config.cjs` | any before this PR |
| `JWT_SECRET` (server signing key) | `skills/ai-talent/ecosystem.config.cjs` | any before this PR |
| `SESSION_SECRET` | `skills/ai-talent/ecosystem.config.cjs` | any before this PR |
| OpenClaw Gateway bearer token (`mos-pm-claw-2026`) | `server/routes/pmRoute.ts`, `server/routes/missionChatRouter.ts`, `server/queue/orchestratorWorker.ts`, `server/queue/squadLeaderWorker.ts` | any before this PR |
| SoWork legacy MySQL password (`SoWork2026db`) | `scripts/execute-phase-prea.ts`, `scripts/diagnose-db-migration.ts` | any before this PR |
| Local mos_db password fallback (`mos_secure_2026`) | ~25 files (tests + scripts + `localDb.ts`) | any before this PR |

**All of these must be rotated at the provider, not just removed from source.**
Once a secret is in git history it is leaked forever — even `git filter-repo`
leaves it in mirrors, forks, and anyone's local clone.

---

## 2. Rotation order

Rotate in the order below. Each step is independent until the final cutover.

### 2.1 `[HUMAN]` Rotate Azure MySQL (primary + SoWork)

1. Sign in to the Azure Portal → MySQL flexible server `ytcreator-ai-server`.
2. **Create a new admin user** (don't just reset the existing one — keep the
   old user around for 24h so long-running batch jobs don't error mid-flight):
   ```sql
   CREATE USER 'mos_app'@'%' IDENTIFIED BY '<new-random-password>';
   GRANT SELECT, INSERT, UPDATE, DELETE ON sowork_db.* TO 'mos_app'@'%';
   FLUSH PRIVILEGES;
   ```
3. Store the new password in Doppler (§3) as `DB_PASSWORD` / `SOWORK_DB_PASSWORD`.
4. Deploy (`git push` triggers CI → CD pushes new env to the VM; see §4 for rollback).
5. **24h later**: revoke the old user:
   ```sql
   DROP USER 'openclaw'@'%';
   ```

### 2.2 `[HUMAN]` Rotate Azure OpenAI

1. Azure Portal → your Azure OpenAI resource → **Keys and Endpoint**.
2. Click **Regenerate Key 2** (always regenerate the one the app is *not*
   currently using so there's zero downtime).
3. Copy the new Key 2 → Doppler as `AZURE_OPENAI_API_KEY`.
4. Deploy.
5. Once the new key is in use, **Regenerate Key 1** to invalidate the leaked one.

### 2.3 `[HUMAN]` Rotate Azure Foundry + Google Gemini + OpenRouter

Same pattern as Azure OpenAI — each provider has a dashboard with
"regenerate / rotate" for API keys:

| Provider | Where | Doppler var |
|---|---|---|
| Azure Foundry | Foundry project → API keys | `AZURE_FOUNDRY_API_KEY` |
| Google Gemini | console.cloud.google.com → API Keys | `GOOGLE_GEMINI_API_KEY` |
| OpenRouter | openrouter.ai/settings/keys → *create new, revoke old* | `OPENROUTER_API_KEY` |

### 2.4 `[HUMAN]` Rotate JWT + Session secrets

1. Generate two new values locally:
   ```bash
   openssl rand -hex 32   # JWT_SECRET
   openssl rand -hex 32   # SESSION_SECRET
   ```
2. Push to Doppler. **Deploying these forces all users to re-login** — this is
   intentional; the old JWT signing key is compromised.
3. Announce a short auth blip in #ops before deploying.

### 2.5 `[HUMAN]` Rotate OpenClaw Gateway bearer token

1. On the gateway host (same VM): generate `openssl rand -hex 24`.
2. Update the gateway config (`/opt/openclaw/gateway/.env`) with the new token.
3. Push the same token to Doppler as `GATEWAY_TOKEN`.
4. Restart both sides in this order: gateway first, then `pm2 reload marketing-os`.

### 2.6 `[HUMAN]` Rotate local mos_db password

Only matters if the VM is exposed beyond localhost:

```bash
mysql -uroot -p
# inside mysql:
SET PASSWORD FOR 'mos_user'@'localhost' = '<new-random-password>';
```

Update Doppler `LOCAL_DB_PASSWORD`, then `pm2 reload marketing-os`.

---

## 3. Doppler provisioning

Goal: every secret listed in `.env.example` lives in Doppler, not in a file on
the VM. This lets us rotate from a web UI, audit access, and stop scp-ing
plaintext `.env` files.

### 3.1 `[HUMAN]` One-time setup

1. `brew install dopplerhq/cli/doppler` on your workstation.
2. `doppler login` — authenticate against the SoWork Doppler workspace.
3. `doppler setup` in the repo root — choose project `marketing-os`, config
   `prd` (or `stg`, `dev` depending on environment).

If the `marketing-os` project doesn't exist yet, create it in the Doppler UI
with three configs: `dev`, `stg`, `prd`.

### 3.2 `[HUMAN]` Seed Doppler from the rotated secrets

Paste each rotated value into `doppler secrets set` (or the UI):

```bash
doppler secrets set \
  DB_HOST=ytcreator-ai-server.mysql.database.azure.com \
  DB_USER=mos_app \
  DB_PASSWORD='<new-rotated-value>' \
  DB_NAME=sowork_db \
  JWT_SECRET='<new-openssl-value>' \
  SESSION_SECRET='<new-openssl-value>' \
  AZURE_OPENAI_API_KEY='<new-rotated-value>' \
  AZURE_OPENAI_ENDPOINT=https://<your-resource>.openai.azure.com \
  GATEWAY_HTTP=http://localhost:18790 \
  GATEWAY_TOKEN='<new-rotated-value>' \
  # …and the rest from .env.example
```

### 3.3 Wire Doppler into the VM

Option A (preferred): install Doppler CLI on the VM and change the deploy script
to run the app under `doppler run --`:

```bash
# on the VM, one-time:
curl -Ls https://cli.doppler.com/install.sh | sudo sh
doppler configure set token <service-token-from-doppler-ui> --scope /opt/marketing-os/app

# update ci.yml deploy step:
# replace:  set -a && source "$AI/.env" && set +a
#           pm2 start "$TSX" --name marketing-os --cwd "$AI" --update-env -- server/index.ts
# with:     pm2 start doppler --name marketing-os --cwd "$AI" --update-env -- run -- "$TSX" server/index.ts
```

Option B (transitional, what CI currently does): keep `.env` on the VM, but
write it from Doppler just before PM2 starts, so there's no long-lived plaintext:

```bash
doppler secrets download --no-file --format env > "$AI/.env"
set -a && source "$AI/.env" && set +a
pm2 start "$TSX" ...
rm -f "$AI/.env"
```

Option A is the target state; Option B is acceptable as a first cut.

---

## 4. Rollback

If deployment breaks after rotation:

1. `ssh` to the VM.
2. `pm2 logs marketing-os --lines 200` — find the missing env var.
3. In Doppler UI, click the config's **History** tab and **restore** the
   previous version. (Doppler keeps versions for 30 days.)
4. `pm2 reload marketing-os`.
5. If the issue is the gateway token mismatch: restart the gateway with the
   old token, re-run the rotation after business hours.

There is no rollback for a rotated provider secret — once you regenerate an
Azure/OpenRouter/Gemini key the old one is dead. That's the point.

---

## 5. Verify no secrets remain in HEAD

Run this from the repo root after the PR is merged:

```bash
# Install gitleaks once: brew install gitleaks
gitleaks detect --config .gitleaks.toml --no-git --verbose
```

CI runs the same command on every PR (see `.github/workflows/ci.yml`'s
`secret-scan` job). If CI is red on `secret-scan`, do not merge — fix the
offending file and push again. Do **not** rewrite git history to bury a
committed secret; rotate it instead (§2) and let the history stand.

### Optional: enable a local pre-commit hook

```bash
cat > .git/hooks/pre-commit <<'EOF'
#!/usr/bin/env bash
set -e
if ! command -v gitleaks >/dev/null; then exit 0; fi
gitleaks protect --staged --config .gitleaks.toml
EOF
chmod +x .git/hooks/pre-commit
```

This catches most mistakes before they hit GitHub.

---

## 6. Why this PR cannot finish the job

This PR:

- ✅ Strips every literal secret from source and replaces it with a
  fail-fast env read.
- ✅ Adds zod validation so missing env vars crash the process at boot, not
  silently in production.
- ✅ Wires `gitleaks` into CI so new secrets can't land.
- ✅ Documents the full rotation procedure in this runbook.

It does **not**:

- ❌ Rotate any provider-side secret. Those are all `[HUMAN]` steps above.
- ❌ Provision Doppler. That is §3, also `[HUMAN]`.
- ❌ Purge git history. By design — `git filter-repo` does not actually
  contain the leak (forks and clones remain), and the correct fix is
  rotation, not rewriting.

Until sections 2–3 are complete by a human with provider access, consider
issue #1 **open**.
