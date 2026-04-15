# Migration: Brand Brain + Mission Exports Tables

**Date:** 2026-04-15
**Applied to:** Azure MySQL (sowork_db) + Local MySQL (mos_db)

## Tables Created

### brand_brain
- Stores brand intelligence entries by category
- Categories: positioning, audience, voice, competitors, custom
- Auto-written by chatRoute Step 6 (positioning flow)

### mission_exports
- Tracks all PPT/PDF/markdown exports per mission
- Auto-recorded after PPT generation in chatRoute Step 6

## New API Endpoints
- GET/POST /api/brand-brain/:brandId
- PUT/DELETE /api/brand-brain/entry/:id
- GET /api/exports?brandId=
- GET /api/missions/:missionId/squad
