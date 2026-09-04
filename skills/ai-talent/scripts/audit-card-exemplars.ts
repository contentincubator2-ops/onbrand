/**
 * audit-card-exemplars — does every brand-pack card point at a real external
 * exemplar, or only at a structure the author invented?
 *
 * 2026-09-05 (CJ「重新檢查，每一個任務卡片，是否都有參考某個得獎案例或爆款
 * 文章」). This traces back to the original spec for the craft card: "agent
 * 根據國際知名案例或熱門類似文章結構的 skill". A card that only says
 * "Process Walkthrough / Myth Correction" names a shape without saying who
 * ever made that shape work, which is the difference between a writing brief
 * and a piece of received wisdom.
 *
 * Run: npx tsx scripts/audit-card-exemplars.ts [packKey]
 */
import { PACKS, packCardId } from "../server/_core/brandPacks";

const packKey = process.argv[2] || "gusheng";
const pack = PACKS.find((p) => p.key === packKey);
if (!pack) {
  console.error(`no pack named ${packKey}. known: ${PACKS.map((p) => p.key).join(", ")}`);
  process.exit(1);
}

/**
 * Capitalised pairs built only from these are the brand's own vocabulary or
 * ordinary prompt scaffolding, not a citation.
 */
const OWN = new Set([
  "New", "Taipei", "City", "Taiwan", "Sanchong", "Gusheng", "English", "Chinese",
  "Instagram", "Facebook", "LinkedIn", "Card", "Cards", "Page", "Pages",
  "Structure", "Rules", "Length", "Subject", "Preview", "Hook", "Build", "Turn",
  "Payoff", "Problem", "Constraint", "Resolution", "Revision", "Spec", "Walk",
  "First", "Call", "Mid", "Project", "Reorder", "Long", "Term", "Dispatch",
  "Follow", "Blind", "Bound", "Comparison", "Process", "Walkthrough", "Single",
  "Detail", "Deep", "Dive", "Myth", "Correction", "Failure", "Modes", "Before",
  "After", "Trade", "Show", "Buyer", "Questions", "Product", "Family", "Families",
  "Material", "Materials", "Yarn", "Beret", "Fedora", "Flat", "Cap", "Ball",
  "Blocked", "Hat", "Beanie", "Casquette", "Accessories", "Uniform", "Headwear",
  "Voice", "Never", "Write", "Open", "Close", "Keep", "Include", "Name", "Say",
  "Output", "Format", "Image", "Direction", "Application", "Construction",
  "Teach", "Answer", "Where", "What", "Which", "There", "These", "Their",
]);

const SIGNALS: { re: RegExp; label: string }[] = [
  { re: /award[- ]winning|\baward\b/i, label: "award" },
  { re: /\bmodelled on\b|\bmodeled on\b/i, label: "modelled-on" },
  { re: /reference shelf/i, label: "reference-shelf" },
  { re: /\bexemplar/i, label: "exemplar" },
  { re: /\bthe way [A-Z]/, label: "the-way-X" },
  { re: /\bpublished in\b|\bwrote about\b/i, label: "citation" },
];

let withRef = 0;
const missing: string[] = [];

/**
 * Every card ends with the same shared blocks — the voice rules and the fact
 * whitelist. Those contain "New Taipei City" and "Sanchong District", so a
 * naive scan reports 32/32 and means nothing. Only the card-specific part of
 * the prompt counts as that card's own reference.
 */
const SHARED_MARKERS = [
  "【Voice — non-negotiable】",
  "【Facebook page, B2B brand】",
  "【Speaker — second-generation operator】",
];
function cardSpecific(prompt: string): string {
  let cut = prompt.length;
  for (const m of SHARED_MARKERS) {
    const i = prompt.indexOf(m);
    if (i >= 0 && i < cut) cut = i;
  }
  return prompt.slice(0, cut);
}

for (const card of pack.cards) {
  if (card.kind !== "custom") continue;
  const p = cardSpecific(card.template.systemPrompt);

  const sig = SIGNALS.filter((s) => s.re.test(p)).map((s) => s.label);
  const proper = [...new Set(p.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})+/g) || [])]
    .filter((s) => !s.split(/\s+/).every((w) => OWN.has(w)));

  const has = sig.length > 0 || proper.length > 0;
  if (has) withRef++; else missing.push(packCardId(card));

  console.log(
    (has ? "REF " : "--- ") +
    packCardId(card).padEnd(26) +
    (proper.length ? " | " + proper.slice(0, 4).join(" / ") : "") +
    (sig.length ? "  [" + sig.join(",") + "]" : ""),
  );
}

const total = pack.cards.filter((c) => c.kind === "custom").length;
console.log("");
console.log(`cards citing an external exemplar: ${withRef} / ${total}`);
console.log("");
console.log(`NO EXEMPLAR (${missing.length}):`);
for (const m of missing) console.log("  " + m);
process.exit(0);
