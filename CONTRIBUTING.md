# Contributing to SoWork Marketing Enterprise

## File Naming

- Server files: `camelCase.ts` (e.g. `tokenLedger.ts`, `userApiKeys.ts`)
- Schema files: `schema.ts` in `drizzle/` directory
- Test files: `*.test.ts` co-located with source
- Config files: `kebab-case.ts` (e.g. `drizzle.config.ts`)

## Function Naming

- DB queries: verb + noun (e.g. `getUser`, `insertTokenLog`, `updateUserCredits`)
- Validators: `validate` + noun (e.g. `validateApiKey`)
- Calculators: `calc` + noun (e.g. `calcCostFromTokens`, `calcInstructionComplexityFactor`)
- Formatters: `format` + noun
- Boolean checks: `is/has/can` + noun (e.g. `hasEnoughCredits`, `pingDb`)

## Environment Variables

- All env vars: `SCREAMING_SNAKE_CASE` (e.g. `DB_HOST`, `ZHIPU_API_KEY`)
- Never hardcode fallback values for sensitive vars (DB creds, API keys, `JWT_SECRET`)
- All vars must be listed in `.env.example` with comments
- Access `JWT_SECRET` only via `getJwtSecret()` from `_core/env.ts` — never spread or log `ENV`

## Import Order

1. Node built-ins (`crypto`, `fs`, `path`)
2. External packages (`drizzle-orm`, `zod`, `express`)
3. Internal `_core` modules (`./env`, `./_core/llm`)
4. Local modules (`./db`, `./tokenLedger`)

## Error Messages

- Never include key names or sensitive values in error messages
- Use generic messages: `"LLM provider not configured"`, `"Database not available"`

## Billing Layer

- **ALL LLM calls that charge users MUST go through `invokeLLMWithBilling()`**
- Direct `invokeLLM()` calls are ONLY for internal/admin/non-billable operations
- `multiModelRouter.callModel()` is for task-type-based auto-routing; it wraps `invokeLLM()`, NOT `invokeLLMWithBilling()`

## Architecture Layers (call direction: top → bottom)

```
OpenClaw Gateway (Slack / LINE / Telegram)
    ↓
chiefOfStaff.ts       — intent detection, agent matching
    ↓
executeTask.ts        — task lifecycle orchestration
    ↓
llmWithBilling.ts     — billing wrapper   ←── all billable calls go here
    ↓
multiModelRouter.ts   — task-type based provider selection
    ↓
llm.ts                — raw HTTP call + response parsing (PROVIDER_CONFIG lives here)
    ↓
External AI APIs      — OpenAI / Zhipu / Qwen / Google / Cohere / Forge
```

**Never short-circuit this chain.** If you need provider selection, use
`multiModelRouter.callModel()`. If you need to add billing, use
`invokeLLMWithBilling()`. Do not call `invokeLLM()` directly from business logic.

## Security Rules

- `userApiKey` is **always** stored as a truncated SHA256 hash — never plaintext (see `tokenLedger.ts`)
- `JWT_SECRET` is excluded from the `ENV` export — use `getJwtSecret()` (see `_core/env.ts`)
- Rate limiter requires `app.set("trust proxy", ...)` when deployed behind Nginx/CDN (see `server/index.ts`)
- Billing fallback logs (`.jsonl`) may contain token counts; restrict file permissions in production

## Database

- Use Drizzle ORM query builder — no raw SQL strings
- Exception: `sql` tagged template for aggregation functions (`SUM`, `COUNT`)
- All migrations via `pnpm db:generate` + `pnpm db:migrate`
- Never run migrations directly against production without review

## Pull Request Checklist

- [ ] New env vars added to `.env.example` with comments
- [ ] No `console.log(ENV)` or spreading of the ENV object in logs
- [ ] Billable LLM calls use `invokeLLMWithBilling()`
- [ ] Sensitive values not included in error messages
- [ ] Tests updated for changed functions
