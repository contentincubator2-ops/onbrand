# onBrand Studio · Changelog

## 2026-09-08
- [NEW] Task card "Source & notes": see purpose, when to use, the award/benchmark references we follow, viral reach numbers with measurement month, evergreen logic, and what you need to provide
- [NEW] Every card shows a launch date (from git history); cards added in the last 30 days are tagged "New", and channel pages show "N new this month" with a new-only filter
- [NEW] New task cards now appear in Notifications and link straight to the card
- [NEW] Pricing: Strategy monitor is part of the Pro plan (alerts when your brand, products or competitors change)
- [NEW] Strategy monitor (Pro plan): one watchlist per brand and product (keywords, competitors, seeded from positioning); auto-scans every 7 days, raises a strategy alert pointing to the anchor to review; manual scan once per 24 hours; alerts also arrive in Notifications
- [NEW] Brand brain "What the AI reads": shows the brief injected before each card runs, with each line traced to its positioning field; missing fields are listed, and you can upload an existing positioning doc to fill them (no need for all 14 steps)

## 2026-05-13
- [NEW] Mia customer-success chat drawer, LLM-backed, aware of your current page, brand and recent tasks
- [NEW] "Need a real human?" escalates to a support ticket in one click, with context attached
- [NEW] `/admin/support` internal SoWork inbox
- [NEW] `/changelog` public changelog (this page)
- [FIX] Positioning finished but content didn't show: server keys didn't match the UI; added a normalizer
- [FIX] Single-post copy was cut off in the mockup title, looking incomplete; removed line-clamp
- [FIX] "+ New" overlapped the support button; removed the floating bottom-right FAB
- [FIX] Blank site (stale bundle hash + silent tsc build failure); deploy now uses pipefail
- [FIX] "Event not found" after applying a campaign positioning framework: wrong entityId was sent
- [FIX] PER_IMAGE_MS 10s → 45s; PiAPI Flux images generate normally
- [IMPROVE] When Anthropic quota runs out, auto-fallback to qwen / azure-foundry instead of retrying every step
- [IMPROVE] The save toast after editing copy is now a "Go to project" button, one tap away
- [IMPROVE] Notification bell now shows real events (positioning done, task output, holiday reminders)

## 2026-05-12
- [NEW] Per-variant "Generate image in this style" button on the Single-post mockup page (OpenAI / PiAPI)
- [NEW] Notification center panel (bottom-left bell)
- [FIX] Stuck positioning jobs now fail automatically after 10 minutes; the UI no longer shows "Analyzing 13/14" forever
- [IMPROVE] Site-wide i18n rewritten in natural English, not literal translation

## 2026-05-11
- [NEW] Brand overview is scope-aware: pick a campaign to open campaign positioning, a product to open product positioning
- [NEW] Basic info / Visuals merged into tabs of the main workspace
- [FIX] A Pokemon Go Dragon Boat campaign was attached to the wrong brand; patched orphan events' brandId
