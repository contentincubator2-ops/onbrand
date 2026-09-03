/**
 * probe-brand-pack.ts — end-to-end smoke test of a brandPack's cards.
 *
 * 2026-09-02: probe-orchestra.ts hand-copies the catalog lookup chain and
 * has no brandPacks branch, so a pack card is invisible to it — the probe
 * would report "template or config missing" for every card in a pack and
 * tell you nothing. This one resolves through findPackTemplate /
 * findPackOrchestraConfig, which is what quickTaskRouter actually calls.
 *
 * It runs against a real brandId so the whole chain is exercised: brand
 * market resolution (which decides whether the zh-TW sanitizer and the
 * craft rubrics' Taiwanese framing apply), brand + product positioning
 * injection, per-variant LLM fanout, and the post-generation gates.
 *
 * Usage on the VM:
 *   cd /opt/onbrand/app/skills/ai-talent
 *   PACK_KEY=gusheng BRAND_ID=2988 npx tsx scripts/probe-brand-pack.ts
 *   PACK_KEY=gusheng BRAND_ID=2988 TASK_IDS=web-gs-craft,fb-gs-brand-origin \
 *     npx tsx scripts/probe-brand-pack.ts
 *
 * Exits 1 if any probed card returns no usable variant, or if a card's
 * output trips one of the brand's hard commercial rules.
 */
import { runOrchestra } from "../server/_core/quickTaskOrchestra";
import { PACKS, findPackTemplate, findPackOrchestraConfig, packCardId } from "../server/_core/brandPacks";
import { getBrandMarket } from "../server/_core/brandMarket";

/**
 * Per-card sample input. Pack cards ask for real material — "which process
 * do you want explained" — so a single generic string produces output that
 * proves nothing. These are written as a user would actually type them.
 */
const SAMPLE_INPUT: Record<string, string> = {
  "web-gs-craft":
    "Felting (縮絨加工). The knitted crown goes into the felting process and comes out denser and smaller, which is why the block size and the knitted size are different numbers. Buyers usually assume the hat is knitted to its finished size. What it changes: density, so the crown holds a shape without wire.",
  "web-gs-care":
    "A felted wool beret that got soaked in rain and dried out of shape. What we tell customers: reshape it while damp over something round of the right size, dry it away from heat, never wring it. Heat is what makes the damage permanent.",
  "web-gs-guide":
    "How to write a spec for a knitted beret so the sample and the bulk run match. What has to be on the sheet: the block, the yarn, the finished diameter after felting, and the edge finish. The one buyers leave off is the finished diameter after felting, and it is the one that causes the mismatch.",
  "em-gs-new-product":
    "A multi-wear beret block that can be worn three ways from one crown. It adds to the existing five beret finishes rather than replacing any. Aimed at brands who want one SKU to cover more than one look. Sampling only at this stage, not in production.",
  "em-gs-reorder":
    "Accounts who ordered winter beanies last season and have not placed a run for this one. The real reason to write now is that yarn selection gets committed earlier than buyers expect. We want them to confirm a repeat of the spec already on file.",
  "em-gs-industry-news":
    "Wool prices moved this quarter and several brands are switching to blends. Our read: the switch is being framed as a cost decision, but the brands moving fastest are the ones who never specified fibre content tightly in the first place.",
  "ig-gs-showcase":
    "A bound-edge beret in undyed wool, just off the block. What to notice: the edge binding is knitted in rather than sewn on, so it does not create a ridge against the forehead.",
  "ig-gs-brand-origin":
    "The block shelf. Over a hundred forms, some older than most of the staff, and the oldest ones are still the most used.",
  "li-gs-co-event":
    "Finished re-cataloguing the block shelf. Every form is now measured and logged, so a buyer asking whether a shape already exists gets an answer the same day instead of next week.",
  "li-gs-co-product":
    "Added a square-crown bucket block with a deeper crown, because buyers kept asking for a bucket hat that clears a ponytail and we did not have one.",
  "li-gs-co-industry":
    "Everyone is writing about nearshoring as a cost story. From the floor it looks like a consistency story — the brands moving are the ones who got burned by a reorder that did not match the first run.",
  "li-gs-cmo-contrarian":
    "Everyone treats a low minimum order quantity as a concession a factory makes to win small accounts. I think it is the opposite: it is only possible if you control every step yourself, and a factory that cannot offer it is telling you something about its own supply chain.",
  "li-gs-cmo-curation":
    "An article arguing that apparel brands should consolidate to fewer suppliers to reduce quality variance. It is right that variance is the problem. It is wrong that consolidation is the fix — variance comes from brokered production, not from supplier count.",
  "li-gs-cmo-company":
    "Spent the morning with a buyer who flew in to see the floor. He asked to see the reject bin, which almost nobody does. It was the best question anyone has asked me this year.",
  "li-gs-cmo-tradeshow":
    "Going to a sourcing show in New York next month. Bringing the five beret finishes so people can handle the difference between them rather than read about it.",
  "fb-gs-brand-origin":
    "Why the factory never moved production offshore in the nineties when almost everyone else in the trade did. It cost us the volume accounts for about a decade.",
  "fb-gs-tradeshow":
    "Set up finished at a sourcing show. Brought the five beret finishes and a few of the older blocks so people can see what they produce.",
  "fb-gs-company-life":
    "Reorganised the yarn store this week. Everything is now sorted by fibre and weight rather than by when it arrived. Took two days and nobody wanted to do it.",
  "fb-gs-new-product":
    "First run off a new mid-brim fedora block. The brim sits between the 787 and the 781, which is the width buyers kept asking for and we did not have.",

  // ── 2026-09-03 additions: the middle of the funnel ──────────────────────
  "web-gs-case":
    "A US outdoor brand wanted a bucket hat that held its shape after being packed flat in a bag. Their previous supplier built it from cut panels and the crown collapsed within a season. We ran it on an existing square-crown block and felted denser than our standard. The first sample came back too stiff to fold at all, which was the opposite problem, so we went back and dropped the density between the two. Second sample was approved.",
  "web-gs-buyer-questions":
    "The questions that come up in almost every first call: what is the minimum, do you charge for tooling, how long does sampling take, what do you need from me before you can quote, and can you match a hat I already have. On tooling: if an existing block fits the shape there is no tooling stage at all, which is what most buyers do not realise.",
  "web-gs-product-page":
    "The beret page. Five finishes — blind-stitch, adjustable, bound-edge, painter, multi-wear — and buyers cannot tell them apart from photographs. The page has to make the difference between blind-stitch and bound-edge legible in words, because that difference is what a wearer feels against the forehead all day.",
  "em-gs-cold-outreach":
    "A US heritage workwear brand whose whole range is wool and made in small runs, except the accessories, which are printed six-panel caps bought from a catalogue. The mismatch is the reason to write. I would offer to send one bound-edge beret in their own colourway so they can handle it.",
  "em-gs-enquiry-reply":
    "A small US brand asked whether we can make a beret in their own wool and what the minimum is. The minimum is 240 per style, 24 per colour. What I cannot answer yet is whether their yarn will felt to the density the shape needs — that needs a physical sample of the yarn. What I need back: the shape reference, the yarn or a sample of it, the colour count, and the season they are aiming at.",
  "em-gs-sample-followup":
    "Sent three beret finishes — blind-stitch, bound-edge and adjustable — all in the same undyed wool so the edge construction is the only variable. What to look at: run a thumb around the inside edge of each and feel where the ridge sits. The honest weak point is that the bound-edge one came out stiffer than I would ship in production.",
  "em-gs-show-invite":
    "A sourcing show in New York next month. Bringing the five beret finishes and a few of the older blocks. The reason to come is that the difference between the finishes cannot be judged from photographs — you have to put them on. Stand number to follow.",
  "em-gs-reactivation":
    "Brands who asked about bucket hats around eighteen months ago and went quiet after sampling. What has changed since: we added a square-crown block with a deeper crown, which was exactly the thing two of them said was missing.",
  "ig-gs-process":
    "Blocking. The felted body goes over the wooden form damp and comes off dry holding the shape. The form does the work, not the stitching — which is why a blocked hat keeps its shape and a sewn one relies on its seams.",
  "ig-gs-carousel-compare":
    "The five beret edge finishes — blind-stitch, adjustable, bound-edge, painter, multi-wear. From a photograph they look almost identical, but each sits differently on the head and is built differently. One card per finish.",
  "li-gs-co-document":
    "How to write a spec for a knitted hat so the sample and the bulk run match. Eight pages: the four lines that must be on the sheet, the one buyers always leave off (finished diameter after felting), and what goes wrong when they do.",
  "li-gs-cmo-dm-intro":
    "A head of product at a US heritage workwear brand who posted last week about moving their wool sourcing out of mainland China. That post is the reason to write. I would ask what is actually blocking the move, because in my experience it is never the factory search.",
  "fb-gs-process":
    "Felting. It is the step where the same yarn can come out right or come out ruined, and the difference is judgement about when to stop. Nobody here has ever written that judgement down — it is learned by standing next to someone who already has it.",
};

/**
 * Hard commercial rules the output must not break. These are the ones where
 * a violation is a business problem rather than a style problem: a published
 * price becomes a commitment, and an invented certification is a claim the
 * company cannot stand behind. Checked case-insensitively against the
 * caption, with a deliberately small, low-false-positive vocabulary.
 */
const FORBIDDEN_IN_OUTPUT: { pattern: RegExp; why: string }[] = [
  { pattern: /\bISO ?\d{4,5}\b/i, why: "invented certification" },
  { pattern: /\bOEKO-?TEX\b/i, why: "invented certification" },
  { pattern: /\bGOTS certified\b/i, why: "invented certification" },
  { pattern: /US\$ ?\d|\$\d|\bUSD ?\d/, why: "published price" },
  { pattern: /\bper unit\b.{0,20}\d/i, why: "published price" },
  { pattern: /\bcost-effective\b/i, why: "banned price language" },
  { pattern: /\bcompetitive pricing\b/i, why: "banned price language" },
];

function captionsOf(result: any): string[] {
  const out: string[] = [];
  const vs = result?.variants ?? result?.results ?? [];
  for (const v of Array.isArray(vs) ? vs : []) {
    const c = v?.caption ?? v?.content ?? v?.text ?? "";
    if (typeof c === "string") out.push(c);
  }
  return out;
}

(async () => {
  const packKey = process.env.PACK_KEY || "gusheng";
  const brandId = Number(process.env.BRAND_ID || 0) || undefined;
  const pack = PACKS.find((p) => p.key === packKey);
  if (!pack) {
    console.error("✗ no pack with key", packKey);
    process.exit(1);
  }

  const only = (process.env.TASK_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const ids = pack.cards.map(packCardId).filter((id) => only.length === 0 || only.includes(id));

  const market = await getBrandMarket(brandId);
  console.log(`\n=== probing pack "${packKey}" against brand ${brandId ?? "(none)"} ===`);
  console.log(`market: targetCountry=${market.targetCountry} outputLanguage=${market.outputLanguage} ` +
    `isZhTW=${market.isZhTW} marketCode=${market.marketCode}`);
  console.log(`cards: ${ids.length}\n`);

  let failed = 0;
  for (const id of ids) {
    const template = findPackTemplate(id);
    const config = findPackOrchestraConfig(id);
    if (!template || !config) {
      console.error(`✗ ${id}: template or config missing — the pack lookup is broken`);
      failed++;
      continue;
    }

    const key = template.primary_input?.key ?? template.inputs[0]?.key ?? "context";
    const inputs: Record<string, string> = { [key]: SAMPLE_INPUT[id] || "" };
    if (!inputs[key]) {
      console.error(`✗ ${id}: no sample input defined in this probe — add one`);
      failed++;
      continue;
    }

    const started = Date.now();
    try {
      const result: any = await runOrchestra({ template, config, inputs, brandId });
      const caps = captionsOf(result);
      const usable = caps.filter((c) => c.trim().length > 0);
      const elapsed = ((Date.now() - started) / 1000).toFixed(1);

      if (usable.length === 0) {
        // The failure mode that unit tests cannot see: the job reports success
        // and every variant is an empty string, usually a caption budget too
        // small for the length the card asks for.
        console.error(`✗ ${id}: ${elapsed}s — ${caps.length} variants, ALL EMPTY`);
        failed++;
        continue;
      }

      // A multi-card deliverable is one post made of N cards. captionsOf only
      // reads the caption, which for a carousel is the main post text — so a
      // carousel that produced zero cards still looks like a pass here. That
      // is the two-layer failure this project has shipped before: the mockup
      // renders a carousel frame around content that was never split.
      const wantCards = config.cardsPerVariant ?? 0;
      if (wantCards > 1) {
        const gotCards = (result?.variants?.[0]?.cards ?? []).length;
        const withCopy = (result?.variants?.[0]?.cards ?? [])
          .filter((c: any) => String(c?.headline ?? "").trim() || String(c?.body ?? "").trim()).length;
        console.log(`    cards: ${gotCards}/${wantCards} attached, ${withCopy} with copy`);
        if (gotCards < wantCards || withCopy < wantCards) {
          console.error(`✗ ${id}: asked for ${wantCards} cards, got ${gotCards} (${withCopy} with copy)`);
          failed++;
        }
      }

      const lens = usable.map((c) => c.length);
      const violations: string[] = [];
      for (const c of usable) {
        for (const rule of FORBIDDEN_IN_OUTPUT) {
          const m = c.match(rule.pattern);
          if (m) violations.push(`${rule.why}: "${m[0]}"`);
        }
      }

      const status = violations.length ? "!" : "✓";
      console.log(`${status} ${id}: ${elapsed}s — ${usable.length}/${config.variants} variants, ` +
        `chars ${Math.min(...lens)}–${Math.max(...lens)}`);
      if (usable.length < config.variants) {
        console.log(`    note: ${config.variants - usable.length} variant(s) came back empty`);
      }
      for (const v of [...new Set(violations)]) {
        console.error(`    VIOLATION ${v}`);
        failed++;
      }
      console.log(`    first 240 chars: ${usable[0].slice(0, 240).replace(/\n/g, " ")}`);
    } catch (e: any) {
      console.error(`✗ ${id}: threw after ${((Date.now() - started) / 1000).toFixed(1)}s — ${e?.message ?? e}`);
      failed++;
    }
  }

  console.log(`\n=== ${failed === 0 ? "ALL PASS" : failed + " FAILURE(S)"} ===`);
  process.exit(failed === 0 ? 0 : 1);
})();
