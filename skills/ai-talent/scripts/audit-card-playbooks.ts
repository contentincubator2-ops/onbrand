/**
 * audit-card-playbooks — which award-winning exemplar does each pack card
 * actually receive at runtime?
 *
 * 2026-09-05 (CJ「重新檢查，每一個任務卡片，是否都有參考某個得獎案例或爆款
 * 文章」). Reading the card prompts alone answers the wrong question: the
 * craft rubrics already carry cited, award-winning exemplars (Shorty Awards,
 * Cannes Lions, CMI, LinkedIn Top Voices), and each platform also resolves a
 * PER-TASK playbook line by keyword-matching the task id.
 *
 * Custom pack ids were never in that keyword vocabulary, so the question is
 * whether they match a real playbook line or silently fall through to the
 * platform's generic default. This prints what each card actually gets.
 *
 * Run: npx tsx scripts/audit-card-playbooks.ts [packKey]
 */
import { PACKS, packCardId } from "../server/_core/brandPacks";
import { isFacebookBodyTask, fbPlaybookFor } from "../server/_core/fbCraft";
import { isInstagramBodyTask, igPlaybookFor } from "../server/_core/igCraft";
import { isLinkedInBodyTask, liPlaybookFor } from "../server/_core/liCraft";
import { isEmailBodyTask, edmPlaybookFor } from "../server/_core/edmCraft";

const packKey = process.argv[2] || "gusheng";
const pack = PACKS.find((p) => p.key === packKey);
if (!pack) {
  console.error(`no pack named ${packKey}`);
  process.exit(1);
}

type Probe = {
  name: string;
  matches: (t: any) => boolean;
  playbook: (id: string) => string;
};

const PROBES: Probe[] = [
  { name: "FB", matches: isFacebookBodyTask, playbook: fbPlaybookFor },
  { name: "IG", matches: isInstagramBodyTask, playbook: igPlaybookFor },
  { name: "LI", matches: isLinkedInBodyTask, playbook: liPlaybookFor },
  { name: "EM", matches: isEmailBodyTask, playbook: edmPlaybookFor },
];

let noRubric = 0;
let generic = 0;
const rows: string[] = [];

for (const card of pack.cards) {
  if (card.kind !== "custom") continue;
  const id = packCardId(card);
  const t = card.template;

  const hit = PROBES.find((p) => {
    try { return p.matches(t); } catch { return false; }
  });

  if (!hit) {
    noRubric++;
    rows.push(`NO-RUBRIC  ${id.padEnd(26)} (channel ${card.channel} has no craft layer)`);
    continue;
  }

  let line = "";
  try { line = hit.playbook(id) ?? ""; } catch (e: any) { line = `<threw: ${e?.message}>`; }
  const flat = String(line).replace(/\s+/g, " ").trim();
  rows.push(`${hit.name}  ${id.padEnd(26)} ${flat.slice(0, 150)}`);
}

for (const r of rows) console.log(r);
console.log("");
console.log(`cards with no craft layer at all: ${noRubric}`);
process.exit(0);
