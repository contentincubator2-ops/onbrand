/**
 * export-cases.ts — 在 dev VM 上跑真的任務卡，把「題目＋品牌資料＋實際產出」匯出成考卷，
 * 交給 foundry_eval.py 用 Microsoft Foundry 評分。
 *
 * 2026-10-04（CJ「第一步，我選擇 microsoft foundry」）。
 *
 * 為什麼在 VM 上、in-process 跑：
 *   要評的是「使用者按下去實際會拿到的東西」——真的品牌大腦、真的任務卡、真的模型鏈。
 *   在本機用假資料跑出來的分數，證明不了 dev 站的品質。
 *
 * 不落地、不扣點：runOrchestra 不傳 userId 就不會 recordTaskRun（跟自建卡的試寫同一招），
 * 所以考卷不會塞進 /projects。只評文字：runImageGen 關掉——圖片要另外的評法，而且貴。
 *
 * 題目怎麼來：
 *   每個品牌 × 每個通路，取前台實際列出的卡（近三個月爆款結構），每通路 PER_CHANNEL 張。
 *   每題的輸入用這個品牌自己的產品名輪流帶，模擬使用者會打的那種一句話。
 *
 * 評審看得到什麼：
 *   【任務】卡名、通路、形式、說明、這次的輸入；【品牌資料】就是模型寫的時候讀的那份
 *   品牌大腦（buildBrandPrefix）。所以「品牌事實正確」是拿同一份資料對答案，不是憑印象。
 *
 * 輸出：每題一行 `EVALCASE <base64(JSON)>` 印到 stdout（base64 是因為 CI log 會把長行與
 * 特殊字元弄壞）。最後一行 `EVALDONE n=<題數> empty=<空白產出數>`。
 *
 * 用法（VM）：
 *   BRAND_IDS=2972 PER_CHANNEL=2 ./node_modules/.bin/tsx scripts/eval/export-cases.ts
 */
import fs from "node:fs";
import localPool from "../../server/localDb";
import { runOrchestra } from "../../server/content/core/engine/quickTaskOrchestra";
import { buildTaskCatalogIndex } from "../../server/content/core/catalog/taskCatalogIndex";
import { isRecentViral } from "../../server/content/core/catalog/taskSource";
import { resolveTaskTemplate, resolveOrchestraConfig } from "../../server/content/core/catalog/taskRegistry";
import { buildBrandPrefix } from "../../server/strategy/core/brand/brandContext";
import { listDirectorsForBrand, getRole, type StrategistScope } from "../../server/strategy/core/strategist/strategistDirectory";
import { gatherBrandContext, buildSystemPrompt } from "../../server/strategy/routers/strategistChatRouter";
import { loadAgentKnowledge } from "../../server/platform/core/agents/agentKnowledge";
import { callModel } from "../../server/platform/core/llm/multiModelRouter";
import { quickTaskRouter } from "../../server/content/routers/quickTaskRouter";

/** 右下角顧問出現的 15 種頁面（前台看得到的；li／yt／pr／x 已下架不考）。 */
const ADVISOR_SCOPES: Array<[StrategistScope, string]> = [
  ["brand", "品牌定位頁"], ["product", "產品頁"], ["copy", "文字頁"],
  ["facebook", "Facebook 任務頁"], ["instagram", "Instagram 任務頁"], ["threads", "Threads 任務頁"],
  ["line", "LINE 任務頁"], ["tiktok", "TikTok 任務頁"], ["email", "電子報任務頁"], ["website", "官網任務頁"],
  ["events", "活動頁"], ["visual", "視覺頁"], ["regulations", "法規頁"], ["performance", "成效層"],
  ["content", "內容企劃頁（本週企劃／靈感／專案）"],
];
/**
 * 顧問的招牌問題有些預設「使用者已經貼了東西」（「這句文案有沒有誇大的問題？」「這個月的數字…」）。
 * 第一輪直接拿去問，顧問回「請先貼給我」——合理的回答，卻被評成不及格（法規 0.34、內容企劃 0.50）。
 * 那是考卷的問題。這裡替這類題目附上使用者會貼的東西；素材刻意帶著該被指出的毛病。
 */
function advisorAttachment(question: string, brandName: string, productName: string | null): string {
  const p = productName ?? brandName;
  if (/數字|數據|指標|報表|後台/.test(question) && /這個月|上個月|這週|本月/.test(question)) {
    return "（使用者貼上的數據）本月：觸及 12,400（上月 15,100）、互動率 2.1%（上月 2.8%）、連結點擊 310（上月 420）、訂單 86 筆（上月 80 筆）、廣告花費 18,000 元（上月 18,000 元）。";
  }
  if (/這句|這段文案|這篇文案|這段|幫我把/.test(question) && /誇大|療效|合規|安全|改/.test(question)) {
    return `（使用者貼上的文案）「${p}每天吃，保證讓你精神變好、提升免疫力，全台最便宜，吃過的人都說比餐廳好吃一百倍！」`;
  }
  if (/這篇|這則|這句|這段|這張|這支|這一頁|這組/.test(question)) {
    return `（使用者貼上的草稿）「${brandName}的${p}開賣了。退冰就能下鍋，五分鐘上桌。想第一次試試看的人，現在可以下單。」`;
  }
  return "";
}
const emit = (row: Record<string, unknown>) =>
  console.log(`EVALCASE ${Buffer.from(JSON.stringify(row), "utf8").toString("base64")}`);

/**
 * 使用者實際拿到的全部內容。第一輪只匯出第一個版本，結果「電子報主旨給 5 個」那種卡
 * 被評成「沒有 5 種主旨」——那是考卷不公平，不是產出的問題。多版本全部帶上並標號。
 */
function allVariantsText(variants: any[]): string {
  const texts = (variants ?? []).map(variantText).filter(Boolean);
  if (texts.length <= 1) return texts[0] ?? "";
  return texts.map((t, i) => `【版本 ${i + 1}】\n${t}`).join("\n\n");
}

const CHANNEL_ZH: Record<string, string> = {
  facebook: "Facebook", instagram: "Instagram", threads: "Threads", line: "LINE 官方帳號",
  tiktok: "TikTok", email: "電子報", website: "官網",
};
const BRAIN_MAX = 7000;

const text = (v: unknown, k: "zh" | "en" = "zh"): string =>
  typeof v === "string" ? v : (v && typeof v === "object" ? String((v as any)[k] ?? (v as any).zh ?? "") : "");

/** 一個版本實際交到使用者手上的文字：主文＋多卡（輪播／相簿）的每一張。 */
function variantText(v: any): string {
  const parts: string[] = [];
  if (typeof v?.caption === "string" && v.caption.trim()) parts.push(v.caption.trim());
  if (Array.isArray(v?.cards)) {
    v.cards.forEach((c: any, i: number) => {
      const line = [c?.headline, c?.body, c?.caption].filter((x) => typeof x === "string" && x.trim()).join("｜");
      if (line) parts.push(`［第 ${i + 1} 張］${line}`);
    });
  }
  return parts.join("\n\n");
}

(async () => {
  const brandIds = String(process.env.BRAND_IDS ?? "").split(",").map((s) => Number(s.trim())).filter((n) => n > 0);
  if (!brandIds.length) throw new Error("BRAND_IDS 沒給");
  // PER_CHANNEL=0 → 這個通路前台列出的卡全部考。
  const perChannelRaw = Number(process.env.PER_CHANNEL ?? 2);
  const perChannel = perChannelRaw <= 0 ? 999 : perChannelRaw;
  const suites = new Set(String(process.env.SUITES ?? "cards,advisors,rewrite").split(",").map((x) => x.trim()).filter(Boolean));
  const channels = String(process.env.CHANNELS ?? Object.keys(CHANNEL_ZH).join(",")).split(",").map((s) => s.trim()).filter(Boolean);
  // 可指定只跑哪幾張卡（重跑不及格的題目時用）。
  const onlyTasks = new Set(String(process.env.TASK_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean));

  // ALL_CARDS=1（CJ「我要你測試過 onbrand 上使用到的所有 Agent」「每個任務卡都是不同 agent」）：
  // 目錄裡的每一張卡都考——不分通路、不分層級、不管前台現在列不列。305 張卡綁了 161 位不同的 agent，
  // 只考前台那 38 張等於只考了一小部分人。
  const allCards = process.env.ALL_CARDS === "1";
  const concurrency = Math.max(1, Math.min(6, Number(process.env.CONCURRENCY ?? 3)));
  const fullCatalog = buildTaskCatalogIndex();
  const catalog = allCards
    ? fullCatalog
    : fullCatalog.filter((t) => channels.includes(String(t.platform)) && String(t.tier) === "30s" && isRecentViral(t.source as any));
  // ALL_CARDS 時有明講 CHANNELS 就只考那幾個通路（例如先考內容層七通路），沒講才是全部通路。
  const cardChannels = allCards && !process.env.CHANNELS ? Array.from(new Set(fullCatalog.map((t) => String(t.platform)))) : channels;
  /** 主問題是「貼上你的資料／網址」的卡：我們給的一句話主題不是它要的輸入，分數不能跟別的卡一起算。 */
  const needsPastedData = (tpl: any): boolean =>
    /貼上|貼入|網址|連結|url|paste|上傳|截圖/i.test(`${text(tpl?.primary_question)} ${String(tpl?.primary_input?.placeholder ?? "")}`);

  // ── 考題檔（EXAM_FILE）──────────────────────────────────────────────────
  // 每張卡自己的幾組輸入（gen_exam_inputs.py 產的，可人工改）。有給就用它，不再用那句通用主題。
  // REPEATS：同一題跑幾次。同一張卡兩次的分數可以差 0.5，只跑一次分不出「卡有問題」跟「這次寫壞」。
  const examFile = String(process.env.EXAM_FILE ?? "").trim();
  const exam: Record<string, Array<Record<string, string>>> = examFile ? JSON.parse(fs.readFileSync(examFile, "utf8")) : {};
  const repeats = Math.max(1, Math.min(5, Number(process.env.REPEATS ?? 1)));
  if (examFile) console.log(`EXAM ${examFile}：${Object.keys(exam).length} 張卡有考題，每題跑 ${repeats} 次`);

  let n = 0, empty = 0;
  for (const brandId of brandIds) {
    const [bRows]: any = await localPool.execute(`SELECT id, name, industry, userId FROM brands WHERE id = ? LIMIT 1`, [brandId]);
    const brand = (bRows as any[])[0];
    if (!brand) { console.log(`SKIP brand ${brandId}: 不存在`); continue; }
    const [pRows]: any = await localPool.execute(`SELECT id, name FROM products WHERE brandId = ? ORDER BY id ASC LIMIT 6`, [brandId]);
    const products: Array<{ id: number; name: string }> = (pRows as any[]).filter((p) => p?.name);
    console.log(`BRAND ${brandId} ${brand.name}｜產業 ${brand.industry ?? "?"}｜產品 ${products.length}`);

    let turn = 0;
    /** 第一篇寫成功的貼文——給「換人重寫」當原稿。 */
    let rewriteBase: { taskId: string; caption: string; channel: string; productId: number | null; topic: string } | null = null;
    // 先把要跑的卡排好（連同輪到哪個產品），再用小型工作池跑——305 張一張一張跑要兩三個小時。
    const jobs: Array<{
      card: (typeof catalog)[number]; ch: string; product: { id: number; name: string } | null;
      /** 考題檔的那一組輸入；沒有考題檔時是 undefined（用通用主題）。 */
      inputs?: Record<string, string>; inputIdx?: number; rep?: number;
    }> = [];
    /** 輸入裡提到哪支產品，就把那支產品的定位帶進去（跟使用者在任務視窗選了產品一樣）；都沒提到就只用品牌。 */
    const productMentioned = (inp: Record<string, string>) => {
      const all = Object.values(inp).join(" ");
      const core = (name: string) => name.replace(/【[^】]*】/g, "").trim();
      return products.find((p) => core(p.name).length >= 2 && all.includes(core(p.name))) ?? null;
    };
    for (const ch of suites.has("cards") || suites.has("rewrite") ? cardChannels : []) {
      const cards = catalog.filter((t) => t.platform === ch && (!onlyTasks.size || onlyTasks.has(t.id)))
        .slice(0, !suites.has("cards") ? 1 : onlyTasks.size || allCards ? 999 : perChannel);
      for (const card of cards) {
        if (examFile) {
          const sets = exam[card.id];
          if (!sets?.length) { console.log(`SKIP ${card.id}: 考題檔沒有這張卡`); continue; }
          sets.slice(0, Math.max(1, Number(process.env.EXAM_MAX_INPUTS ?? 9))).forEach((inputs, inputIdx) => {
            for (let rep = 0; rep < repeats; rep++) jobs.push({ card, ch, product: productMentioned(inputs), inputs, inputIdx, rep });
          });
          continue;
        }
        jobs.push({ card, ch, product: products.length ? products[turn % products.length]! : null });
        turn++;
      }
    }
    if (!suites.has("cards")) jobs.splice(3);     // 只考「換人重寫」時，有一篇原稿就夠（留三次機會）
    console.log(`CARDS ${jobs.length} 張，併發 ${concurrency}`);

    const runCard = async ({ card, ch, product, inputs: examInputs, inputIdx, rep }: (typeof jobs)[number]): Promise<void> => {
        if (!suites.has("cards") && rewriteBase) return;
        const template: any = await resolveTaskTemplate(card.id);
        const config: any = await resolveOrchestraConfig(card.id);
        if (!template || !config) { console.log(`SKIP ${card.id}: 沒有 template／config（${card.tier}）`); return; }

        const inputKey = template.primary_input?.key ?? template.inputs?.[0]?.key ?? "topic";
        const fieldLabel = (k: string) => text((template.inputs ?? []).find((i: any) => i.key === k)?.label) || k;
        const topic = examInputs
          ? Object.entries(examInputs).map(([k, v]) => (Object.keys(examInputs).length > 1 ? `［${fieldLabel(k)}］${v}` : v)).join("\n")
          : product
            ? `這次主打「${product.name}」，想吸引第一次購買的人`
            : `介紹${brand.name}，讓沒聽過的人想多了解`;
        const runInputs: Record<string, string> = examInputs ?? { [inputKey]: topic };

        const started = Date.now();
        let response = "", err = "", agentName = "", variantCount = 0, firstVariant = "";
        /** 交付前檢查對每一版做了什麼（consistent／fixed／flagged／skipped＋問題類別）。 */
        let check: Array<{ s: string; a: string[]; r?: string }> = [];
        try {
          const result: any = await runOrchestra({
            template,
            config: { ...config, runImageGen: false },
            inputs: runInputs,
            brandId,
            ...(product ? { productId: product.id } : {}),
            tier: (["30s", "60s", "99s"].includes(String(card.tier)) ? String(card.tier) : "30s") as any,
          });
          response = allVariantsText(result?.variants ?? []);
          firstVariant = variantText(result?.variants?.[0]);
          variantCount = (result?.variants ?? []).length;
          agentName = String(result?.captionAgent?.name ?? "");
          check = (result?.brandConsistency ?? []).map((c: any) => ({
            s: String(c?.status ?? ""), a: (c?.issues ?? []).map((i: any) => String(i?.aspect ?? "")),
            ...(c?.reason ? { r: String(c.reason).slice(0, 80) } : {}),
          }));
          if (!response) err = `ok=${result?.ok} errors=${JSON.stringify(result?.errors ?? []).slice(0, 200)}`;
        } catch (e: any) {
          err = String(e?.message ?? e).slice(0, 200);
        }
        const brain = (await buildBrandPrefix(brandId, product?.id ?? null, null, "full", ch).catch(() => "")).slice(0, BRAIN_MAX);

        const query = [
          `【任務】通路：${CHANNEL_ZH[ch] ?? ch}。任務卡：${text(template.label) || card.labelZh}（形式 ${card.postType}）。`,
          text(template.description) ? `任務說明：${text(template.description)}` : "",
          text(template.primary_question) ? `任務卡問使用者的問題：${text(template.primary_question)}` : "",
          `使用者這次的輸入（這裡出現的事實是使用者自己提供的，可以用）：${topic}`,
          variantCount > 1 ? `這張卡一次產出 ${variantCount} 個版本供使用者挑選，下面的回應是全部版本；請以「使用者拿到這一整份」來評。` : "",
          `目標市場：台灣（繁體中文）。`,
          `【品牌資料】`,
          brain || `品牌：${brand.name}（沒有讀到品牌資料）`,
        ].filter(Boolean).join("\n");

        // 空白產出照樣出題：任務顯示成功、產出空白，正是要被評成不及格的失敗。
        if (!response) { empty++; response = "（產出為空白）"; }
        if (firstVariant && !rewriteBase && firstVariant.length >= 60) {
          rewriteBase = { taskId: card.id, caption: firstVariant, channel: ch, productId: product?.id ?? null, topic };
        }
        if (!suites.has("cards")) return;
        const row = {
          suite: "cards", agent: agentName || null, variantCount,
          agentId: Number(template.agent_id ?? 0) || null, tier: String(card.tier),
          sourceType: String((card.source as any)?.type ?? ""), frontVisible: isRecentViral(card.source as any),
          needsData: examInputs ? false : needsPastedData(template), check,
          ...(examInputs ? { inputIdx, rep } : {}),
          id: examInputs ? `${brandId}:${card.id}#i${inputIdx}r${rep}` : `${brandId}:${card.id}`, brandId, brandName: brand.name, channel: ch, taskId: card.id,
          taskLabel: text(template.label) || card.labelZh, topic, query, response,
          empty: response === "（產出為空白）", error: err || null, latencyMs: Date.now() - started,
        };
        emit(row);
        console.log(`  ${row.id} [${agentName}] ${row.empty ? "EMPTY " + err : response.length + " 字／" + variantCount + " 版"} ${(row.latencyMs / 1000).toFixed(1)}s`);
        n++;
    };
    // 工作池：一張卡壞掉（丟例外）不能拖垮整輪。
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length || 1) }, async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++]!;
        try { await runCard(job); }
        catch (e: any) { console.log(`CARDFAIL ${job.card.id}: ${String(e?.message ?? e).slice(0, 160)}`); }
      }
    }));

    // ── 右下角顧問：每個頁面的三位，各問他自己的第一題招牌問題 ─────────────────
    // 照 strategistChat.sendMessage 的組法（同一份 system prompt、同一條模型路由），
    // 但不建對話、不寫訊息——考的是回答，不是對話紀錄。
    if (suites.has("advisors")) {
      const ownerId = Number(brand.userId);
      for (const [scope, pageLabel] of ADVISOR_SCOPES) {
        const directors = await listDirectorsForBrand(brand.industry ?? null, scope).catch(() => []);
        if (!directors.length) console.log(`SKIP advisors ${scope}: 沒有人選`);
        for (const d of directors) {
          const role = getRole(d.roleId);
          const baseQuestion = d.signatureQuestions?.[0];
          if (!baseQuestion) continue;
          const attachment = advisorAttachment(baseQuestion, brand.name, products[0]?.name ?? null);
          const question = attachment ? `${baseQuestion}
${attachment}` : baseQuestion;
          const productId = scope === "product" && products.length ? products[0]!.id : null;
          const started = Date.now();
          let response = "", err = "", brandCtx = "";
          try {
            brandCtx = await gatherBrandContext(brandId, ownerId, productId);
            const knowledge = await loadAgentKnowledge(d.agentId, { source: "probe" } as any).catch(() => "");
            const r: any = await callModel([
              { role: "system", content: buildSystemPrompt(d, brandCtx, knowledge) },
              { role: "user", content: question },
            ], "general");
            // 面板上不會顯示的控制標記拿掉（跟 parseActions 同一組標記）。
            response = String(r?.content ?? "").replace(/<<action:[a-z_0-9]+>>[^\n<]*/gi, "").replace(/<<ask>>[^\n<]*/gi, "").trim();
          } catch (e: any) { err = String(e?.message ?? e).slice(0, 200); }
          const query = [
            `【頁面】${pageLabel}。使用者在這一頁打開右下角的顧問發問。`,
            `【顧問】${d.name}（${d.title}），在這一頁負責的角度：${d.roleLabel}。`,
            `這個角度的定義：${role.promptAngle}`,
            `【使用者的問題】${question}`,
            `目標市場：台灣（繁體中文）。`,
            `【品牌資料】`,
            brandCtx.slice(0, BRAIN_MAX) || `品牌：${brand.name}（沒有讀到品牌資料）`,
          ].join("\n");
          if (!response) { empty++; response = "（產出為空白）"; }
          emit({
            suite: "advisors", agent: d.name, agentId: d.agentId, roleId: d.roleId, scope,
            id: `${brandId}:advisor:${d.roleId}`, brandId, brandName: brand.name, question, query, response,
            empty: response === "（產出為空白）", error: err || null, latencyMs: Date.now() - started,
          });
          console.log(`  advisor ${scope}/${d.roleId} [${d.name}] ${response.length} 字 ${((Date.now() - started) / 1000).toFixed(1)}s ${err}`);
          n++;
        }
      }
    }

    // ── 換人重寫：成品頁的五位寫手，各自重寫同一篇原稿 ─────────────────────────
    if (suites.has("rewrite")) {
      // 在 runCard 的閉包裡賦值，TS 的流程分析看不到——明講型別。
      const base = rewriteBase as { taskId: string; caption: string; channel: string; productId: number | null; topic: string } | null;
      let writers: any[] = [];
      try { writers = (await import("../../client/src/v2/content/pages/run/runModel")).REWRITE_AGENTS as any[]; }
      catch (e: any) { console.log(`SKIP rewrite: 讀不到寫手名單（${String(e?.message ?? e).slice(0, 120)}）`); }
      if (!base) console.log("SKIP rewrite: 沒有可當原稿的貼文");
      const caller: any = quickTaskRouter.createCaller({ user: { id: Number(brand.userId) } } as any);
      const brain = base ? (await buildBrandPrefix(brandId, base.productId, null, "full", base.channel).catch(() => "")).slice(0, BRAIN_MAX) : "";
      for (const w of base ? writers : []) {
        const started = Date.now();
        let response = "", err = "";
        try {
          const r: any = await caller.refineCaption({
            currentCaption: base!.caption, userFeedback: w.instruction, agentId: w.agentId,
            agentName: w.name, agentTitle: w.title, brandId, taskId: base!.taskId,
            ...(base!.productId ? { productId: base!.productId } : {}),
          });
          response = String(r?.rewritten ?? "").trim();
        } catch (e: any) { err = String(e?.message ?? e).slice(0, 200); }
        const query = [
          `【任務】通路：${CHANNEL_ZH[base!.channel] ?? base!.channel}。這是「換人重寫」：寫手 ${w.name}（${w.title}）要把下面的原稿用自己的風格重寫。`,
          `重寫指示：${w.instruction}`,
          `原本的主題：${base!.topic}`,
          `【原稿】\n${base!.caption}`,
          `目標市場：台灣（繁體中文）。`,
          `【品牌資料】`,
          brain || `品牌：${brand.name}（沒有讀到品牌資料）`,
        ].join("\n");
        if (!response) { empty++; response = "（產出為空白）"; }
        emit({
          suite: "rewrite", agent: w.name, agentId: w.agentId,
          id: `${brandId}:rewrite:${w.agentId}`, brandId, brandName: brand.name, taskId: base!.taskId, query, response,
          empty: response === "（產出為空白）", error: err || null, latencyMs: Date.now() - started,
        });
        console.log(`  rewrite [${w.name}] ${response.length} 字 ${((Date.now() - started) / 1000).toFixed(1)}s ${err}`);
        n++;
      }
    }
  }
  console.log(`EVALDONE n=${n} empty=${empty}`);
  await (localPool as any).end?.();
  process.exit(0);
})().catch((e) => { console.error("EXPORT FAILED", e?.message ?? e); console.error(e?.stack); process.exit(1); });
