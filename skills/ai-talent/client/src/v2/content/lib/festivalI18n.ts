/**
 * festivalI18n — small lookup table to translate festival contentHint
 * (which is DB-seeded in zh-TW only) for the EN locale.
 *
 * Keyed by festival slug, same slugs as `scripts/migrate.ts` FESTIVALS_SEED.
 * If a slug isn't in the map, we hide the hint in EN mode (cleaner than
 * showing untranslated Chinese in an otherwise-English UI).
 */
const HINT_EN: Record<string, string> = {
  "women-day-2026":         "Honor women, brand equality",
  "white-valentine-2026":   "Return gifts, second confession",
  "228-2026":               "Tone is solemn — most brands sit this one out",
  "children-day-2026":      "Childhood nostalgia, family moments",
  "qingming-2026":          "Solemn — most brands skip; home/memorial only",
  "mother-day-2026":        "Mom gifts, family dinners, gratitude copy",
  "dragon-boat-2026":       "Zongzi visuals, long weekend, tradition",
  "father-day-2026":        "Dad gifts, dad stories, a fresh take on masculinity",
  "qixi-2026":              "Eastern romance, starry imagery",
  "ghost-month-2026":       "Folklore brands only — tread lightly",
  "teacher-day-2026":       "Salute educators, lifelong learning",
  "mid-autumn-2026":        "Mooncake, reunion, BBQ, moon-gazing",
  "double-tenth-2026":      "National identity",
  "double-9-2026":          "Honor elders, senior wellness",
  "halloween-2026":         "Costumes, parties, Gen Z, brand playfulness",
  "double-11-2026":         "E-commerce mega sale",
  "thanksgiving-2026":      "B2B client thanks, family gatherings",
  "double-12-2026":         "Year-end follow-up sale",
  "christmas-2026":         "Gift guides, parties, end-of-year thanks",
  "new-year-eve-2026":      "NYE parties, fireworks, year wrap-up",
  "new-year-2027":          "New year, new beginnings",
  "spring-festival-2027":   "Lunar New Year wishes, red envelopes",
  "mother-day-2027":        "Mother's Day main wave",
  "father-day-2027":        "Father's Day main wave",
  "mid-autumn-2027":        "Mid-Autumn main wave",
  "christmas-2027":         "Christmas main wave",
};

export function getFestivalHintEn(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return HINT_EN[slug] ?? null;
}
