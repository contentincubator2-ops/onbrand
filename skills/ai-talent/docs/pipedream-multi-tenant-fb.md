# Pipedream FB Publish — Multi-tenant Workflow Notes

**Date:** 2026-05-11
**Context:** Drop is multi-tenant SaaS; each user connects their own
Facebook account. The Pipedream workflow must therefore use the
calling user's Connect token rather than a single shared account.

---

## Backend payload (already implemented)

`publishRouter.toFacebook` now POSTs the following JSON to
`PIPEDREAM_FB_PUBLISH_WEBHOOK`:

```json
{
  "page_id": "<brand's fbPageId from DB>",
  "message": "<caption>",
  "connect_external_user_id": "<our userId, as string>",
  "_meta": {
    "secret": "<PIPEDREAM_WEBHOOK_SECRET>",
    "outputId": 123,
    "variantIndex": 0,
    "brandId": 45,
    "userId": 7,
    "fbPageName": "摘星行銷"
  }
}
```

Key change vs. the 2026-05-09 single-tenant version:
- `connect_external_user_id` is new — the workflow must pass this to
  the Facebook Pages step's "Connect account" selector so Pipedream
  loads THIS user's vault token.

---

## Required Pipedream workflow edits (CJ does on Pipedream UI)

1. Open the workflow triggered by `PIPEDREAM_FB_PUBLISH_WEBHOOK`.
2. Optional: verify `steps.trigger.event.body._meta.secret` matches
   `PIPEDREAM_WEBHOOK_SECRET` env (reject if not).
3. **Facebook Pages → Create Post** step:
   - Account selector: switch from a hard-coded account to
     "External User ID" → bind to
     `{{steps.trigger.event.body.connect_external_user_id}}`.
   - Page ID field: `{{steps.trigger.event.body.page_id}}`.
   - Message: `{{steps.trigger.event.body.message}}`.
4. End-of-workflow Return step: keep returning `{post_id, permalink_url}`
   so the frontend toast can link to the published post.

---

## Onboarding flow for users (CJ-facing copy)

1. User goes to `/brands` → picks a brand → Settings (top-right gear)
   → 「發布」tab.
2. Click `連接 Facebook` → opens Pipedream Connect popup in new tab.
3. Approve FB OAuth → Pipedream stores the user's Page Access Token.
4. Back in our tab, paste the FB Page ID (numeric, found on the
   page's About → Page transparency).
5. Save → `brands.fbPageId` populated, FB section shows 「已連接」.
6. From now on, RunPage → 「直接發 FB」 just works.

If a user tries to publish before binding, the backend throws
`PRECONDITION_FAILED` "此品牌尚未連接 Facebook 粉專" and the
frontend toast auto-navigates them to `/brands/edit?b=<id>&tab=publish`.

---

## Edge cases

- **Multiple brands, same FB account**: fine — each brand row has its
  own fbPageId; Pipedream vault is per `external_user_id` (= our
  userId), so all of that user's brands can reuse the same OAuth.
- **User changes FB password / revokes app**: next publish attempt
  will get a Pipedream 401. Surface that as
  "Facebook 授權已過期，請到品牌設定 → 發布重新連接".
- **Team accounts (future)**: when we add team-shared brands, the
  current `brand.fbPageId` model still works but we'll need to decide
  whose Pipedream token to use. Most likely: store
  `brand.fbConnectedByUserId` alongside.
