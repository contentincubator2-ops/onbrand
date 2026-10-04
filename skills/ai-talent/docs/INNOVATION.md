# What is different about onBrand Studio

A reviewer-facing summary. Every claim below points at code you can open. Paths are relative to `skills/ai-talent/` and were checked against the tree on 2026-10-04 (server code lives in `server/{platform,strategy,content,performance}`).

## 1. One Brand Brain feeds every generation and the checks after it

- `server/strategy/core/brand/brandContext.ts` (`buildBrandBrain`) assembles one prompt prefix plus a per-item memory list. Order is deliberate: market constraints, locked attributes, voice, writer guidance, context, product, event, regulation last so it is never crowded out.
- The same brain is read by the writers and by the post-write checker `server/content/core/engine/brandConsistency.ts`. When the checker cannot run it reports `skipped`; it does not invent a passing score.
- `server/content/core/engine/regulationCompliance.ts` (`enforceBrandAndRegulations`) applies the brand's own regulation text after writing.

## 2. Product images that refuse to fabricate

- `server/content/core/engine/productSubjectPolicy.ts` fails closed. If a product run's real photo is missing or its link is dead, generation stops with `PRODUCT_SUBJECT_UNAVAILABLE_ERROR` (used from `engine/orchestra/imageStep.ts`) instead of silently falling back to text-to-image and drawing an invented product.
- `server/content/core/image/imagePromptGuards.ts` keeps separate guard blocks for product and non-product images. Tests: `engine/productSubjectPolicy.test.ts`, `image/imagePromptGuards.test.ts`.

## 3. Pixels from the model, typography from a layer

- `server/content/core/image/imageGen.ts` (`NO_TEXT_PROMPT_BLOCK`) tells the model to render no text. Image models invent plausible but wrong Chinese glyphs, so the title is meant to be an editable overlay instead of baked into the image.
- Verified scope: the editable title overlay is wired end to end only on the YouTube mockup path (`client/src/v2/content/pages/RunPage.tsx` passes `overlayTitle` to the YouTube mockup, `PlatformMockup/youtube.tsx` renders it). The Facebook mockup also renders a title over the image; Instagram and TikTok do not have this editable overlay today. The no-text prompt rule applies wherever `imageGen.ts` is used.

## 4. Persona agents wrapped in validate-then-repair contracts

- `server/content/core/engine/quickTaskOrchestra.ts` runs task cards with named persona agents.
- Deterministic contracts sit around the model in `server/content/core/engine/`: `adCopyContract.ts` (`validateAdCopy`, `repairAdCopy`), `rewriteContract.ts`, `shotListContract.ts`, `adSlotContract.ts`. Output that breaks the contract is repaired or retried, not shipped.
- `server/content/core/squad/agentMatcher.ts` picks agents per task.

## 5. Positioning to campaign, per market

- `server/strategy/core/positioning/` runs the positioning method as async jobs (`positioningJobRunner.ts`, `positioningSteps.ts`; router `server/strategy/routers/positioningJobsRouter.ts`); `positioningLock.ts` locks the result and it flows into the brain, then into campaign planning.
- `server/strategy/core/brand/marketProfiles.ts` and `brandMarket.ts` make target country and output language a first-class input to both positioning and copy.

## 6. Nothing reaches a customer's page without a human approval

- `server/content/core/publishGate.ts`: a post publishes only if its output is approved. In a multi-person workspace the approver must be someone other than the author; a solo user (nobody else who could review) is exempt. Editing text after approval does not revoke it. Publishing on a teammate's behalf (`canPublishFor`) is limited to workspace owners and admins, and the approval gate still applies to them.
- Scheduled auto-publish is opt-in: `server/content/core/scheduledPublishWorker.ts` does nothing unless `AUTOPUBLISH_SCHEDULED=on` and the `SOCIAL_PUBLISH_ENABLED` kill switch is not off. It only publishes approved outputs, claims a row before posting so nothing is posted twice, skips rows more than 6 hours overdue, and marks a failure `failed` with a readable reason instead of retrying on its own. A person can retry a failed post (`calendar.retry`), which only puts it back in the queue; the gate runs again at publish time.
- Publishing goes through bundle.social (`server/platform/core/connectors/publish/bundlePublish.ts`, `server/content/core/publish/`). Caption length and media rules are checked before sending, and failures are turned into plain messages (`publish/publishErrors.ts`).

## 7. The Claude connector can draft, but cannot approve or publish

- `server/gateway/mcp/onbrandTools.ts` exposes read, plan and generate tools only (brand context, task cards, run a task, fetch a result, team board, add plan slots). There is deliberately no approve or publish tool: the approval boundary is a human one, and publishing also needs an approved output plus a per-brand platform connection. The header comment of that file records the reason; the connector instructions in `onbrandMcpRouter.ts` tell the model to send the user back to onBrand Studio to review and publish.

## Measured, not claimed

`scripts/proof-metrics.ts` (logic in `server/platform/core/proofMetrics.ts`) prints completion rate, revision rate, approval rate, time to first output, LLM fallback rate, generation time per output (p50/p95, per feature) and edit rate (how often a user edited the AI draft, with edit size), each with its sample size. Figures with no data print as "—". The edit flag exists only for saves made after it shipped, so early edit-rate samples are small. Run it on production before quoting any number: `npx tsx scripts/proof-metrics.ts --days 90`.
