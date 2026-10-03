# What is different about onBrand Studio

A reviewer-facing summary. Every claim below points at code you can open. Paths are relative to `skills/ai-talent/server/`.

## 1. One Brand Brain feeds every generation and the checks after it

- `strategy/core/brandContext.ts` (`buildBrandBrain`) assembles one prompt prefix plus a per-item memory list. Order is deliberate: market constraints, locked attributes, voice, writer guidance, context, product, event, regulation last so it is never crowded out.
- The same brain is read by the writers and by the post-write checker `content/core/brandConsistency.ts`. When the checker cannot run it reports `skipped`; it does not invent a passing score.
- `content/core/regulationCompliance.ts` (`enforceBrandAndRegulations`) applies the brand's own regulation text after writing.

## 2. Product images that refuse to fabricate

- `content/core/productSubjectPolicy.ts` fails closed. If a product run's real photo is missing or its link is dead, generation stops with `PRODUCT_SUBJECT_UNAVAILABLE_ERROR` instead of silently falling back to text-to-image and drawing an invented product.
- `content/core/imagePromptGuards.ts` keeps separate guard blocks for product and non-product images. Tests: `productSubjectPolicy.test.ts`, `imagePromptGuards.test.ts`.

## 3. Pixels from the model, typography from a layer

- `content/core/imageGen.ts` (`NO_TEXT_PROMPT_BLOCK`) tells the model to render no text. Image models invent plausible but wrong Chinese glyphs, so titles are an editable overlay in the client mockups instead of baked into the image.

## 4. Persona agents wrapped in validate-then-repair contracts

- `content/core/quickTaskOrchestra.ts` runs task cards with named persona agents.
- Deterministic contracts sit around the model: `adCopyContract.ts` (`validateAdCopy`, `repairAdCopy`), `rewriteContract.ts`, `shotListContract.ts`, `adSlotContract.ts`. Output that breaks the contract is repaired or retried, not shipped.
- `content/core/agentMatcher.ts` picks agents per task.

## 5. Positioning to campaign, per market

- `strategy/positioning/` runs the positioning method as async jobs; `strategy/core/positioningLock.ts` locks the result and it flows into the brain, then into campaign planning.
- `strategy/core/marketProfiles.ts` and `brandMarket.ts` make target country and output language a first-class input to both positioning and copy.

## Measured, not claimed

`scripts/proof-metrics.ts` prints completion rate, revision rate, approval rate, time to first output and LLM fallback rate from real data, each with its sample size. Figures with no data print as "—". Run it on production before quoting any number.
