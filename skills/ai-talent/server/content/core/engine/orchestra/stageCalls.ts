/**
 * 編排器每一階段的 LLM 呼叫：總監、寫手、視覺簡報、輪播、回覆範本、發文時間等。
 */
import type { FBTaskTemplate, OrchestraConfig } from "../../catalog/quickTaskFB";
import { certMissionOf, certKnowledgeBlock, MISSING_INFO_RULE_NO_FABRICATION, FACT_DISCIPLINE_RULE } from "../../catalog/platformCertKnowledge";
import { type MarketCode, type PlatformCode, getCopywritingMasterPrompt } from "../../../../strategy/core/brand/copywritingMaster";
import { isAdCopyTemplate, buildAdCopyRule, validateAdCopy, repairAdCopy } from "../adCopyContract";
import { adSlotOf, buildAdSlotRule, validateAdSlot, repairAdSlot } from "../adSlotContract";
import { isWuganVoiceTemplate, validateWuganVoice, buildWuganVoiceReminder, repairWuganVoice } from "../wuganVoiceContract";
import { isShotListTemplate, buildShotListRule, normalizeShotList, validateShotList, repairShotList } from "../shotListContract";
import { pickOwnAngleBlock, angleWritingBlock, sanitizeAngleLabel, checkAngle, dedupeAngleLabels, angleVisualLens } from "../variantAngles";
import { isEmailBodyTask, EDM_CRAFT_RUBRIC, edmPlaybookFor } from "../../catalog/edmCraft";
import { isInstagramBodyTask, IG_CRAFT_RUBRIC, igPlaybookFor, isInstagramTask } from "../../catalog/igCraft";
import { isFacebookBodyTask, FB_CRAFT_RUBRIC, fbPlaybookFor } from "../../catalog/fbCraft";
import { isLinkedInBodyTask, LI_CRAFT_RUBRIC, liPlaybookFor } from "../../catalog/liCraft";
import { isTikTokBodyTask, TT_CRAFT_RUBRIC, ttPlaybookFor } from "../../catalog/ttCraft";
import { isYouTubeBodyTask, YT_CRAFT_RUBRIC, ytPlaybookFor } from "../../catalog/ytCraft";
import { isPRBodyTask, PR_CRAFT_RUBRIC, prPlaybookFor } from "../../catalog/prCraft";
import { isBrandStrategyBodyTask, BR_CRAFT_RUBRIC, brPlaybookFor } from "../../catalog/brCraft";
import { isKOLBodyTask, KL_CRAFT_RUBRIC, klPlaybookFor } from "../../catalog/klCraft";
import { isResearchBodyTask, RS_CRAFT_RUBRIC, rsPlaybookFor } from "../../catalog/rsCraft";
import { isCrossplatformBodyTask, CW_CRAFT_RUBRIC, cwPlaybookFor } from "../../catalog/cwCraft";
import { type ModelProvider, callModel } from "../../../../platform/core/llm/multiModelRouter";
import { detectNonDeliverable } from "../captionSanity";
import { aiModelToProvider, LLM_BUDGET_MS, STRATEGIST_BUDGET_MS } from "./orchestraTypes";
import { stripCaptionPreamble, sanitizeCaption } from "./captionSanitizers";

export function tryParseJson(text: string): any {
  let t = (text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = t.search(/[{\[]/);
  if (start > 0) t = t.slice(start);
  const lastBrace = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (lastBrace >= 0) t = t.slice(0, lastBrace + 1);
  try { return JSON.parse(t); } catch { return null; }
}

export function timeoutPromise<T>(ms: number, label: string): Promise<T> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms),
  );
}

export async function callOneVariant(args: {
  template: FBTaskTemplate;
  config: OrchestraConfig;
  label: string;
  captionPersona: string;
  brandPrefix: string;
  urlContext: string;
  userMsg: string;
  /** Actual args.inputs keys for the deterministic internal-key leak gate. */
  inputKeys: readonly string[];
  /** Agent's aiModel field — maps to provider (qwen/Kimi/glm). null = use template.preferredModel */
  agentAiModel?: string | null;
  /** Strategist anchor (multi-post / narrativeArc tasks) — injected before user msg */
  strategistAnchor?: string;
  /** 2026-07-17 多市場: brand's master-persona market. undefined = legacy zh-TW; null = no matching master → omit block. */
  market?: MarketCode | null;
  /** Whether final copy must be zh-TW; used by the non-deliverable gate. */
  isZhTW: boolean;
  /** Ad-copy tasks: landing URL the user typed (deterministically extracted); null = none. */
  requestedUrl?: string | null;
  /** Labels of ALL versions written in parallel (this one included) — so each call knows what it must differ from. */
  siblingLabels?: readonly string[];
}): Promise<{ label: string; caption: string; hashtags?: string[] }> {
  const { template, config, label, captionPersona, brandPrefix, urlContext, userMsg, inputKeys, agentAiModel, strategistAnchor, market, isZhTW } = args;
  // 2026-10-04（CJ「讓它們都熟讀這些考題」，從 Facebook 這個 mission 開始）：這張卡所屬的平台如果已經
  // 整理好認證範圍的知識，就把那份知識、不誘發編造的缺資訊處理、以及事實紀律一起帶進去。
  // CERT_KNOWLEDGE=0 可整組關掉（評測時用同一個 commit 比較開與關）。還沒整理到的平台＝null＝行為不變。
  const certMission = process.env.CERT_KNOWLEDGE === "0" ? null : certMissionOf(template);
  const certBlock = certKnowledgeBlock(certMission);
  const adCopy = isAdCopyTemplate(template);
  // 2026-09-25（CJ「剛剛生出來的文案，顯示得很奇怪」）：單欄位廣告卡（標題／
  // 說明／CTA）的字數在 systemPrompt 裡寫了，但沒有任何東西在驗證——adCopy 那套
  // 只認 [headline]/[primary]/[CTA] 標記，這幾張沒有標記，整個掉在守備範圍外。
  const adSlot = adSlotOf((template as any)?.id);
  const wuganVoice = isWuganVoiceTemplate(template);
  // 2026-08-23: 分格腳本卡的交付物不是貼文，需要自己的合約把社群骨架關掉。
  const shotList = isShotListTemplate(template);
  const requestedUrl = adCopy ? (args.requestedUrl ?? null) : null;
  // Multi-post / labeled-slot tasks reference {label} in template.systemPrompt;
  // substitute the actual post slot before sending to LLM.
  // {today} → market-appropriate date format so PR datelines / calendar
  // dates are never stale. zh markets (and legacy undefined) keep
  // YYYY年M月D日; other known markets use their locale; unmapped → ISO.
  const _now = new Date();
  const todayStr = (market === undefined || (market ?? "").startsWith("zh"))
    ? `${_now.getFullYear()}年${_now.getMonth() + 1}月${_now.getDate()}日`
    : market
    ? _now.toLocaleDateString(market, { year: "numeric", month: "long", day: "numeric" })
    : _now.toISOString().slice(0, 10);
  const filledSystemPrompt = template.systemPrompt
    .replace(/\{label\}/g, label)
    .replace(/\{today\}/g, todayStr);
  // 2026-09-22 (CJ「不應該將所有產品都規定為情感版、理性版還有數據版……香氛產品用數據版，好奇怪」):
  // a handful of generic, apply-to-any-product tasks (pickOwnAngle) don't get a pre-assigned label at
  // all — the writer picks whichever angle fits THIS product and reports its own choice back (see
  // extractCaption's "label" field below). Everything else keeps the existing fixed-label behaviour.
  const angleBlock = config.pickOwnAngle
    ? pickOwnAngleBlock({ index: Math.max(1, (args.siblingLabels?.indexOf(label) ?? -1) + 1), total: config.variants })
    : angleWritingBlock(label, { siblings: args.siblingLabels, taskSystemPrompt: template.systemPrompt });

  // 2026-05-16 (CJ「一句話 brand brief 變成長文改寫 — 指令太短還是
  // agent 不準？」root cause): a single soft "字數 X-Y 字" line gets
  // buried under the master persona + guardrails, so micro-tasks
  // (headline / one-liner) blow past the cap and rewrite the pasted
  // source instead of compressing. For small caps make the constraint
  // authoritative + explicitly frame it as compression, not rewrite.
  const lengthHint =
    config.captionMaxChars > 0
      ? (config.captionMaxChars <= 60
          ? `【嚴格字數 — 最高優先】整個 caption 必須在 ${config.captionMinChars}-${config.captionMaxChars} 字以內，` +
            `只能是 1 句，不分段、不加 hashtag、不加開場白或解釋。` +
            `這是「濃縮」任務：使用者貼的長文只是素材，你的工作是把它` +
            `提煉成符合任務要求的那一句，**嚴禁改寫或摘要成多段**。`
          : `字數 ${config.captionMinChars}-${config.captionMaxChars} 字。`)
      : "字數依任務本身規範。";

  // Critical ordering: urlContext goes AFTER brandPrefix so URL content is
  // the most recent context the LLM sees. Plus explicit precedence rule.
  //
  // 2026-05-06: Hard-found bug — brand_brain prefix says "所有產出都要符合
  // 下面的定位" which overrode URL content (e.g. cars video → Shopee
  // shopping copy because user's brand was Shopee-related). When URL is
  // present, wrap brandPrefix with a hard override: subject = URL, brand
  // = voice-only, ignore brand positioning / products / services.
  const hasUrl = urlContext.length > 0;
  const brandSection = hasUrl
    ? brandPrefix
      ? `\n# 品牌（**只取語氣參考，主題請看下面 URL**）\n` +
        `⚠️ 重要：以下品牌資訊「**只用於語氣 / 用詞 / 受眾**」。` +
        `絕對不要把品牌的定位、產品、服務塞進這次的 caption。` +
        `若 URL 是談汽車、品牌是 Shopee 工具 — caption 必須關於汽車，跟 Shopee 無關。\n` +
        `（以下品牌大腦摘要原本要求「所有產出都要符合定位」，但本次任務 URL 已指定主題，這條規則暫時關閉。）\n` +
        brandPrefix
      : ""
    : `\n# 品牌語氣參考\n${brandPrefix}`;
  const subjectRule = hasUrl
    ? `\n【主題優先序 — 最重要】\n` +
      `本次任務的「主題」=上面 URL 抓到的內容。品牌不是主題。\n` +
      `caption 必須具體呼應 URL 內容（提到影片裡的事件、數字、名稱、人事物），不要寫通用模板，不要繞回品牌主商品。\n` +
      `即使 URL 主題與品牌領域完全無關，也必須直接以 URL 主題撰寫貼文，不要硬扯品牌。\n` +
      `嚴禁輸出提問、澄清請求、說明、免責聲明、或任何非貼文內容。\n` +
      `素材不足時，以標題與描述推論主題撰寫；不得臆造具體數據或事件細節。\n` +
      `一律使用品牌目標市場語言輸出。\n`
    : "";

  const strategistSection = strategistAnchor
    ? `\n# 系列敘事框架（由 strategist 規劃 — 必須遵循）\n${strategistAnchor}\n` +
      `↑ 上面是整個系列的結構錨點。你寫的這篇必須對應「${label}」這一段，` +
      `且與其他段呼應、不重複內容。\n`
    : "";

  // 2026-05-08 (CJ — sowork-ai-v2 study): inject the per-market master
  // persona BEFORE task-specific rules. Was: thin "為品牌寫一篇 FB
  // 短貼文" → output reads generic. Now: full 10-year-veteran 台灣社群
  // master with cultural element bank + ban list, then platform guide,
  // THEN task-specific systemPrompt. 3 layers of grounding.
  const platformCode = (template.outputDefaults?.platform ?? "facebook") as PlatformCode;
  // 2026-07-17 多市場: market comes from brands.targetCountry/outputLanguage.
  // null = brand's language has no master persona (e.g. th/vi) → omit the
  // block entirely; the market section in brandPrefix carries the language
  // directive. undefined (legacy callers) keeps the zh-TW default.
  const masterBlock = market === null
    ? ""
    : getCopywritingMasterPrompt({ market: market ?? "zh-TW", platform: platformCode });

  // 2026-05-16 (CJ「KOL Brief 完全不符標準」root cause): document
  // tasks bypass the social-caption scaffolding entirely. The 台灣社群
  // master persona + 「主角必須是輸入內容」+ 貼文格式規則 jointly force
  // the model to rewrite the pasted material into a FB post, ignoring
  // the structured-document systemPrompt. Lean prompt: template
  // instruction is dominant; input is explicitly raw material to be
  // distilled into the document, NOT rewritten into a post.
  // 2026-05-17 (CJ「學習 IAC 得獎 email」): email-family tasks get the
  // award-grade craft rubric + per-use-case playbook appended after the
  // task instruction. Brand-agnostic craft (HOW); brand essence still
  // from the digest, hard rules from the post-gen enforcement layer.
  // 2026-05-17: inject the heavy rubric ONLY for full-body email tasks.
  // Atomic fragments (subject-line / preview-text, 3 distinct angle
  // variants in ≤30 chars) were homogenised by the big shared block —
  // their own per-{label} prompt handles craft.
  const edmBlock = isEmailBodyTask(template)
    ? `\n\n${EDM_CRAFT_RUBRIC}\n\n${edmPlaybookFor(template.id)}\n`
    : "";
  // 2026-05-17 (CJ「IG 也要得獎工藝層」): IG-family body tasks get the
  // visual+copy dual-track rubric + per-use-case playbook, mirroring
  // edmBlock. Atomic fragments (hashtag/bio/dm/comment) excluded by
  // isInstagramBodyTask — their own per-{label} prompt handles craft.
  const igBlock = isInstagramBodyTask(template)
    ? `\n\n${IG_CRAFT_RUBRIC}\n\n${igPlaybookFor(template.id)}\n`
    : "";
  // 2026-05-17 (CJ「所有平台都要得獎工藝層」): FB / LI / TT / YT body tasks
  // each get a platform-specific award-grade rubric + per-task playbook,
  // same architecture as edmBlock / igBlock. Atomic fragments excluded by
  // their respective isXxxBodyTask guards.
  const fbBlock = isFacebookBodyTask(template)
    ? `\n\n${FB_CRAFT_RUBRIC}\n\n${fbPlaybookFor(template.id)}\n`
    : "";
  const liBlock = isLinkedInBodyTask(template)
    ? `\n\n${LI_CRAFT_RUBRIC}\n\n${liPlaybookFor(template.id)}\n`
    : "";
  const ttBlock = isTikTokBodyTask(template)
    ? `\n\n${TT_CRAFT_RUBRIC}\n\n${ttPlaybookFor(template.id)}\n`
    : "";
  const ytBlock = isYouTubeBodyTask(template)
    ? `\n\n${YT_CRAFT_RUBRIC}\n\n${ytPlaybookFor(template.id)}\n`
    : "";
  // 2026-05-17 (CJ「所有平台都要得獎工藝層」): PR / Brand Strategy / KOL /
  // Research / Cross-Platform craft layers — same architecture as above.
  const prBlock = isPRBodyTask(template)
    ? `\n\n${PR_CRAFT_RUBRIC}\n\n${prPlaybookFor(template.id)}\n`
    : "";
  const brBlock = isBrandStrategyBodyTask(template)
    ? `\n\n${BR_CRAFT_RUBRIC}\n\n${brPlaybookFor(template.id)}\n`
    : "";
  const klBlock = isKOLBodyTask(template)
    ? `\n\n${KL_CRAFT_RUBRIC}\n\n${klPlaybookFor(template.id)}\n`
    : "";
  const rsBlock = isResearchBodyTask(template)
    ? `\n\n${RS_CRAFT_RUBRIC}\n\n${rsPlaybookFor(template.id)}\n`
    : "";
  const cwBlock = isCrossplatformBodyTask(template)
    ? `\n\n${CW_CRAFT_RUBRIC}\n\n${cwPlaybookFor(template.id)}\n`
    : "";

  // 2026-07-18 多市場 (P2): the 11 award-craft rubrics are zh-TW "structure
  // textbooks" with Taiwan cultural framing. Rather than maintaining 11×N
  // per-market rewrites, non-zh-TW markets get ONE override: keep the
  // STRUCTURE (hook / narrative arc / rhythm / close), localize everything
  // else. Applies when the brand's market is known and not zh-TW (null =
  // unmapped language — note still applies; undefined = legacy zh-TW).
  const anyCraft = edmBlock || igBlock || fbBlock || liBlock || ttBlock ||
    ytBlock || prBlock || brBlock || klBlock || rsBlock || cwBlock;
  const craftLocaleNote = (market !== undefined && market !== "zh-TW" && anyCraft)
    ? `\n\n【工藝準則在地化 — 重要】上方得獎工藝準則是以台灣市場中文寫成的「結構教材」：` +
      `只取其結構（開場鉤子 / 敘事弧 / 節奏 / 收尾 / 格式），**輸出一律用品牌目標市場語言**；` +
      `文化引用（節慶 / 場景 / 慣用語 / 平台梗）改用目標市場的在地等效，不得出現台灣特有元素（夜市 / 便利商店 / 中元節…）。\n`
    : "";

  // 2026-05-18 (CJ「行事曆其他支柱格式是亂的」): calendar pillar agents
  // must emit a STRICT JSON array. The social-caption scaffolding below
  // (craft rubric + 「只寫 1 個變體 caption」+「不要排成結構化卡片」+
  // {caption} object wrapper) actively fights that → prose/garbage.
  // Give calendar a MINIMAL clean prompt: persona + the strict task
  // prompt + brand context only.
  // 2026-05-18 (CJ 驗收 newsjack): calendar AND any cleanPrompt task
  // bypass the social-caption scaffolding (craft rubric + 「只寫1變體
  // caption」+「hashtag 放文末」+「不要結構化卡片」) which sabotages
  // strict structured formats / guardrails (the newsjack 4-field format
  // + no-hashtag rule kept being overridden).
  // 2026-05-19 (CJ 驗收 newsjack #3「JSON 裸輸出，每個 tab 顯示相同 blob」):
  // calendarMerge 與 cleanPrompt 之前被合併成同一個 calMode，都被要求
  // 「只輸出 JSON 陣列」。calendar 是「一次呼叫產全部 → 下游 split」所以
  // 要陣列；但 cleanPrompt 任務（newsjack）走 per-variant fanout，每個
  // {label} 是獨立 LLM call，被要求輸出陣列 → 每個 call 都吐出全部 5
  // 變體的 JSON array → 每個 tab 顯示相同 blob、渲染器拆不開。
  //   calendarMode：保留陣列輸出（merge/split 在下游）
  //   cleanMode   ：minimal 乾淨 prompt（保留 guardrail 不被社群 scaffold
  //                 蓋掉）+ 單變體 + 標準單一 JSON 物件輸出，讓既有
  //                 per-variant fanout + L1 extractCaption 正常分流。
  const calendarMode = !!config.calendarMerge;
  const cleanMode = !!config.cleanPrompt && !config.calendarMerge;
  const docMode = template.outputMode === "document";
  const deliverableOnlyRule =
    `\n\n【只輸出可交付成品 — 最高優先，違反即視為失敗】\n` +
    `這是一鍵速產任務，使用者不會再補充。**無論資訊多不足，都必須直接產出一份完整、可用的成品**。\n` +
    `- 禁止輸出任何審議過程、選項評估、抓取流程、處理步驟或模型內心獨白。\n` +
    `- 禁止自述工作原則、限制、降級策略或「我的處理方式」，不得解釋理由。\n` +
    `- 嚴禁反問或要求補充，尤其不得輸出「我需要更多資訊」「請提供」「請補充」「為了完成需要…」等句子或要求清單。\n` +
    `- 禁止輸出輸入欄位的內部名稱（例如 snake_case 識別字）；只使用使用者看得懂的自然語言。\n` +
    `- 來源連結抓不到內容時，直接依 URL 標題、描述與主題完成任務要求的成品；不得提及、暗示或解釋抓取失敗。\n` +
    `caption 只能包含最終可發布文字本身。`;
  const promptCore = calendarMode
    ? `# 角色（寫作口吻參考）\n${captionPersona}\n\n` +
      `# 任務（最高指令，必須完全遵循；只輸出 JSON 陣列，不要任何其他文字）\n` +
      filledSystemPrompt +
      `\n\n# 品牌脈絡（素材，扣回用，不要照抄）\n${brandPrefix}` +
      (hasUrl ? `\n\n# 參考素材（URL 抓到的內容）\n${urlContext}` : "")
    : cleanMode
    ? `# 角色（寫作口吻參考，不要把自我介紹寫進輸出）\n${captionPersona}\n\n` +
      `# 任務（最高指令，必須完全逐條遵循其格式與【絕對規則】）\n` +
      filledSystemPrompt +
      // 2026-08-22: strategist anchor was missing from cleanMode — a
      // multi-segment clean-prompt task (live run-of-show) needs the arc
      // just as much as a social one. No-op for newsjack (no strategist).
      strategistSection +
      `\n\n【本次只產 1 個變體】**${label}**：` +
      (config.cleanPromptVariantHint ??
        `只接「這一個」時事/角度，完全照任務指定的四欄純文字格式輸出這 1 個變體的內容。`) +
      `\n**嚴禁**輸出 JSON 陣列、**嚴禁**一次列出多個變體、**嚴禁**把其他 ` +
      `tab 的內容也寫進來——每個變體是獨立一次產出，只有一份。\n\n` +
      `【輸出格式】輸出嚴格 JSON 物件（不是陣列）：\n` +
      `{"caption":"${config.cleanPromptCaptionSpec ??
        `<這 1 個變體的四欄純文字內容，保留【角度】【為什麼會被報】【一句 pitch】【建議下一步】四個方括號標題與換行>`
      }","hashtags":[]}\n` +
      `第一個字元就是 {。不要 code fence、不要前言、caption 外不要多寫字。\n` +
      `\n# 品牌脈絡（素材，扣回用，不要照抄）\n${brandPrefix}` +
      (hasUrl ? `\n\n# 參考素材（URL 抓到的內容）\n${urlContext}` : "")
    : docMode
    ? // 2026-05-16 (CJ「人設應該 follow agent，不要到處都是人設指令」):
      // doc tasks use the ASSIGNED agent's persona as the voice/role —
      // no hardcoded "文件撰寫者", no social master. captionPersona is
      // the KOL-savvy agent we picked for this task.
      `# 你的角色（用此專業背景與口吻撰寫）\n` +
      captionPersona +
      `\n# 任務說明（最高指令 — 必須完全遵循其章節結構與順序）\n` +
      filledSystemPrompt +
      edmBlock +
      igBlock +
      fbBlock +
      certBlock +
      liBlock +
      ttBlock +
      ytBlock +
      prBlock +
      brBlock +
      klBlock +
      rsBlock +
      cwBlock +
      craftLocaleNote +
      strategistSection +
      `\n\n【本次只產 1 個變體】**${label}**：在不更動章節結構的前提下，` +
      `用此變體的風格詮釋（完整正式版＝最詳盡；精簡重點版＝每節更精煉；活動主題版＝圍繞本次活動主軸）。\n` +
      `${lengthHint}\n\n` +
      `【素材使用 — 關鍵】\n` +
      `user message / URL / 品牌資訊都只是**素材**。你的工作是從中萃取資訊、` +
      `填進文件對應章節，**嚴禁把素材照抄或改寫成一篇文章 / 社群貼文**。` +
      `缺的具體資訊一律用「[待補：例如 上稿日期]」標出，絕不反問使用者、絕不省略任何章節。\n\n` +
      `【輸出格式】\n` +
      `輸出嚴格 JSON 物件：{"caption":"<文件完整內容>","hashtags":[]}\n` +
      `caption 內就是完整 Markdown 文件本身，**完整保留 # 標題、表格、> 引言等 Markdown 結構**。` +
      `第一個字元就是 {。不要 code fence、不要前言、不要在 caption 外多寫任何字。\n` +
      brandSection +
      (hasUrl ? `\n# 素材：URL 抓到的內容（萃取用，不要照抄）\n${urlContext}` : "")
    : masterBlock + "\n\n" +
    `# 你的角色 / 寫作風格參考\n` +
    captionPersona +
    `\n# 任務說明（特定任務規範 — 蓋過上方平台通則）\n` +
    filledSystemPrompt +
    edmBlock +
    igBlock +
    fbBlock +
    certBlock +
    liBlock +
    ttBlock +
    ytBlock +
    prBlock +
    brBlock +
    klBlock +
    rsBlock +
    cwBlock +
    craftLocaleNote +
    strategistSection +
    // 2026-09-22 (CJ「不應該將所有產品都規定為情感版、理性版還有數據版」)：pickOwnAngle 任務
    // 不先報一個固定名稱——角度由 angleBlock（pickOwnAngleBlock）自己決定；其餘任務維持原本
    // 「只寫 1 個變體：**理性版**」的固定指定，通用切角的寫法定義在 variantAngles.ts，任務自己的
    // systemPrompt 已經提到這個名稱的，維持任務自己的寫法。
    (config.pickOwnAngle ? `\n\n【本次任務】只寫這組貼文裡的 1 篇。\n` : `\n\n【本次任務】只寫 1 個變體：**${label}**。\n`) +
    angleBlock +
    `${lengthHint}\n\n` +
    `【角色 vs 主角 — 重要】\n` +
    `上面的「角色」只是給你**寫作口吻**參考。**主角永遠是用戶或用戶輸入的內容**（在 user message + URL context）。\n` +
    `絕對不要把你（agent）的職稱、姓名、服務描述、自我介紹寫進輸出。\n` +
    `不要寫「我是 ___」、「___ 專家，幫 ___ 做 ___」、不要把你的姓名（例如 #NinaYeh / @JanetChang）寫成 hashtag、@mention 或 caption 內任何形式。\n` +
    subjectRule +
    `\n【格式要求 — 重要】\n` +
    `- caption 欄位**絕對不要**寫「${typeof template.label === "string" ? template.label : (template.label?.zh ?? template.label?.en ?? template.id)}」${config.pickOwnAngle ? "、你自選的版本名稱本身" : `、「${label}」`}或任務 / label 名稱。\n` +
    `- caption 欄位**絕對不要**夾雜視覺描述、英文 prompt、「image_style:」、「visual:」等技術註記。圖片風格由另一位 agent 獨立處理，這裡只放最終發到平台的純文字內容。\n` +
    `- 用自然斷行（兩個 newline 分段）。**不要**用「｜」全形管道符號當分隔線。\n` +
    `- emoji 點綴用就好，不要每段開頭都塞 emoji。\n` +
    `- hashtag 集中放在文末**最後一行**，不要散落文中。\n` +
    `- 段落像真人寫的，不要排成「標題｜內文｜hashtag」結構化卡片。\n` +
    `- 若任務有時間戳結構（如 [0-3s]），務必保留每段秒數標記，不要省略。\n\n` +
    // 2026-05-16 (CJ「品質不佳，是否第一題要強制更多資訊」root cause):
    // 2026-06-10 (CJ「資訊不夠時不要用 [請補充] 佔位符」改造):
    // Old version told AI to use [待補：xxx] placeholders when missing data.
    // Those leaked to users as ugly bracket-text in the final caption.
    // New version: 3-step smart fallback (素材 → 場景 → 對話起手式).
    // Placeholders forbidden entirely; defensive scrub also strips them
    // post-LLM (see sanitizeCaption regex below).
    (certMission ? MISSING_INFO_RULE_NO_FABRICATION : (
      `\n【缺資訊時的處理 — 三步降級，禁用任何佔位符】\n` +
      `**絕對不准**輸出「[待補：xxx]」「[請補充：xxx]」「[填入：xxx]」「[ASSUMPTION]」這類括號標記。\n` +
      `缺具體事實（日期 / 數字 / 人名 / 連結）時，按順序降級：\n` +
      `1. 先從〈品牌大腦〉〈URL 抓到的內容〉抓真實素材填空。\n` +
      `2. 還是不夠 → **用具體場景敘述**取代「具體數據宣稱」。\n` +
      `   ✗ 壞：「87% 的人都這樣」（沒來源不准寫數字）\n` +
      `   ✓ 好：「晚上 8 點打開冰箱，看到剩半盒...」（場景畫面不需來源）\n` +
      `3. 場景也想不出 → 用「對話起手式」：「我跟一位 [TA 角色] 聊到...」「上週客人說了一句話讓我想很久...」\n\n`
    )) +
    `輸出嚴格 JSON 物件（不是陣列）：\n` +
    (config.pickOwnAngle
      ? `{"label":"<你自選的版本名稱>","caption":"<完整貼文>","hashtags":["..."]}\n`
      : `{"caption":"<完整貼文>","hashtags":["..."]}\n`) +
    `第一個字元就是 {。不要 markdown code fence、不要前言。\n` +
    brandSection +
    (hasUrl ? `\n# URL 抓到的內容（本次主題來源 — 必須以此為主）\n${urlContext}` : "");
  // Ad-copy contract goes LAST so it is the freshest instruction and wins
  // over the social scaffold's「不要排成結構化卡片」rule.
  // 事實紀律放在工藝準則之後、格式合約之前：它要壓過「用數字開場／量化結果」，
  // 但廣告／分鏡的格式合約仍然要是最後一條。
  const system = promptCore + deliverableOnlyRule
    + (certMission ? FACT_DISCIPLINE_RULE : "")
    + (adCopy ? buildAdCopyRule(requestedUrl) : "")
    + (adSlot ? buildAdSlotRule(adSlot) : "")
    + (shotList ? buildShotListRule() : "");

  // 2026-10-04 評測用：把這一版實際要送給模型的完整指令印出來（搭配 EVAL_NO_LLM，不呼叫模型）。
  // 用途：改由 Claude Code 這邊的 agent 依同一份指令寫稿（走 Max 方案，不走 API 計費）。
  if (process.env.EVAL_PROMPT_DUMP === "1") {
    // 分段印：整份指令的 base64 有幾萬字元，CI log 會把太長的一行截斷。
    const b64 = Buffer.from(JSON.stringify({ taskId: template.id, label, system, user: userMsg }), "utf8").toString("base64");
    const key = `${template.id}|${Buffer.from(String(label), "utf8").toString("hex").slice(0, 24)}`;
    const parts = Math.ceil(b64.length / 3000);
    for (let i = 0; i < parts; i++) console.log(`EVALPROMPTPART ${key} ${i} ${parts} ${b64.slice(i * 3000, (i + 1) * 3000)}`);
  }

  // Provider + model selection priority:
  //   1. Agent's aiModel (from JSON-assigned real-person agent) — uses both
  //      provider mapping AND the exact model string (so claude-haiku stays
  //      claude-haiku, not silently downgraded to claude-sonnet via DEFAULT)
  //   2. Template's preferredModel (per-task hardcoded provider only)
  //   3. qwen as final default
  // 2026-05-16 (CJ「新聞稿品質太差，agent 是否也很差」root cause):
  // when the assigned agent has NO aiModel, this used to fall back to
  // template.preferredModel — which is hardcoded "qwen" (a Chinese
  // model) for almost EVERY quick-task template (FB / PR / KOL / …).
  // For a Taiwan-only product that emits weird Simplified / mainland
  // phrasing → the systemic "agent quality" complaint. Fix: route the
  // no-agent path through the SAME zh-TW Option-B policy. Only honour
  // preferredModel when it explicitly names a safe non-Chinese
  // provider; "qwen"/"zhipu"/azure-*/"any" all get the weighted
  // non-Chinese pick (anthropic 55% / openai 45%).
  const zhSafePick = (): ModelProvider => (Math.random() < 0.55 ? "anthropic" : "openai");
  const pm = template.preferredModel as string;
  const provider: ModelProvider = agentAiModel
    ? aiModelToProvider(agentAiModel)
    : (pm === "anthropic" || pm === "openai" ? (pm as ModelProvider) : zhSafePick());
  // 2026-05-16 (CJ「企劃台慢」root cause): aiModelToProvider now FORCE-
  // returns "anthropic" (zh-TW policy). The agent's aiModel string
  // (e.g. "glm-4-flash", "qwen3-32b", "claude-haiku-4-5") is Azure /
  // vendor naming — passing it as the explicit model to the *direct*
  // Anthropic API → 404 not_found on EVERY call → wasted RTT then
  // fallback to openai. That 404-then-retry on every single LLM call
  // is why theater (63 calls/run) crawled. Fix: stop pinning the
  // per-agent model. Let each provider use its own proven default
  // (anthropic → claude-sonnet-4-6, confirmed working via probe).
  const explicitModel: string | undefined = undefined;
  void agentAiModel; // provider already derived above; model intentionally unset

  // 2026-05-09 (CJ direction「掃描 ai provider + agent model 匹配」):
  // Resilient parse. LLM sometimes returns valid Chinese caption but in a
  // shape tryParseJson can't extract (e.g. nested object, plain text without
  // braces, "caption" key in different language). Fall through 3 layers:
  //   L1: strict JSON with .caption field (preferred)
  //   L2: any object with a string field that looks like the caption
  //   L3: raw text (strip code fences) if it's substantial Chinese/English
  //       — better to ship usable copy than fail the variant entirely.
  const extractCaption = (raw: string, parsed: any): { caption: string; hashtags?: string[]; label?: string } => {
    // L1: standard shape
    if (typeof parsed?.caption === "string" && parsed.caption.trim().length > 0) {
      return {
        caption: parsed.caption.trim(),
        hashtags: Array.isArray(parsed?.hashtags) ? parsed.hashtags.slice(0, 15).map(String) : undefined,
        // Only meaningful when config.pickOwnAngle asked for it; harmless (ignored) otherwise.
        label: typeof parsed?.label === "string" ? parsed.label.trim() : undefined,
      };
    }
    // L2: alternate keys (LLM sometimes uses "content", "text", "post", "貼文")
    if (parsed && typeof parsed === "object") {
      for (const key of ["content", "text", "post", "貼文", "文案", "body"]) {
        if (typeof parsed[key] === "string" && parsed[key].trim().length > 0) {
          return { caption: parsed[key].trim(), hashtags: Array.isArray(parsed?.hashtags) ? parsed.hashtags.slice(0, 15).map(String) : undefined };
        }
      }
      // Array shape: take first string field
      if (Array.isArray(parsed) && parsed[0]) {
        const first = parsed[0];
        if (typeof first === "string" && first.trim().length > 0) return { caption: first.trim() };
        if (typeof first?.caption === "string") return { caption: first.caption.trim() };
        // 2026-05-18 (CJ「行事曆產出空白」): a top-level array of objects
        // (e.g. the calendar's [{day,pillar,hook,…}, …]) has no .caption
        // and L3's length cap would drop it → empty. Preserve the whole
        // array as a JSON-string caption so calendarMerge can parse it.
        // 2026-05-19 (CJ 驗收 newsjack #3): ONLY do this for calendar. For
        // cleanMode (newsjack) the prompt now forces a single object per
        // fanout call; if the model still regresses to an array, dumping
        // the whole JSON into every tab is exactly the reported P0. Format
        // the FIRST element's fields into the readable four-欄 text so the
        // tab shows usable copy instead of a raw JSON blob.
        if (typeof first === "object") {
          if (calendarMode) return { caption: JSON.stringify(parsed) };
          const fields = ["角度", "為什麼會被報", "一句 pitch", "建議下一步"];
          const lines = fields
            .filter((k) => typeof first[k] === "string" && first[k].trim())
            .map((k) => `【${k}】${String(first[k]).trim()}`);
          if (lines.length > 0) return { caption: lines.join("\n\n") };
          return { caption: JSON.stringify(first) };
        }
      }
    }
    // L3: raw text fallback. Strip code fences + JSON-y noise. If at least
    // 30 chars of substantive text remain, ship it.
    const cleaned = (raw ?? "")
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .replace(/^\s*\{[\s\S]*?"caption"\s*:\s*"/i, "") // strip leading {"caption":"
      .replace(/"\s*[,}][\s\S]*$/, "")                 // strip trailing
      .trim();
    if (cleaned.length >= 30 && cleaned.length <= 2000 && /[一-鿿]|[A-Za-z]{10,}/.test(cleaned)) {
      console.warn(`[callOneVariant] L3 raw-text fallback for ${label} (${cleaned.length} chars)`);
      return { caption: cleaned };
    }
    return { caption: "" };
  };

  let attempt = 0;
  let lastErr: any = null;
  let lastRaw = ""; // for diagnostics
  let adCopyIssue = ""; // ad-copy contract violation from the previous attempt
  let wuganVoiceIssue = ""; // 五感十築句型合約：上一次的違反內容
  let shotListIssue = ""; // shot-list contract violation from the previous attempt
  let angleIssue = ""; // 版本切角違反（目前只驗數據版有數字）
  while (attempt < 2) {
    attempt++;
    try {
      // 2nd attempt: append explicit reminder to user msg, lowering model
      // creativity and forcing strict JSON.
      const reminderJsonShape = config.pickOwnAngle ? `{"label":"...","caption":"...","hashtags":[]}` : `{"caption":"...","hashtags":[]}`;
      const userMsgWithReminder = attempt === 2
        ? `${userMsg}\n\n[REMINDER] ${shotListIssue ? `上次回應違反分格腳本合約：${shotListIssue}。請照【分格腳本合約】重寫：至少 3 格，每格四行「畫面/動作/聲音/字卡」齊全，全篇不要 hashtag。` : adCopyIssue ? `上次回應違反廣告格式合約：${adCopyIssue}。請照【廣告格式合約】重寫。` : wuganVoiceIssue ? wuganVoiceIssue : angleIssue ? `上次回應不符合你選的切角設計：${angleIssue}。請照【版本切角】重寫（可以沿用同一個 label，也可以換一個更貼切的）。` : "上次回應沒給可解析、可交付的 caption。"}請嚴格回覆 ${reminderJsonShape} JSON，第一個字元就是 {，不要任何 markdown / 前言 / 解釋。不得要求澄清，不得輸出審議過程、選項評估、自述工作原則、處理步驟或輸入欄位內部名稱；來源抓不到內容時就依 URL 標題、描述與主題直接寫，絕不說明抓取失敗。caption 只能放最終成品。`
        : userMsg;
      const r = await Promise.race([
        callModel(
          [
            { role: "system", content: system },
            { role: "user", content: userMsgWithReminder },
          ],
          undefined,
          provider,
          explicitModel,
        ),
        // 長篇卡（例如一次排整個月的行事曆）用自己的預算；其餘照舊 40s。
        timeoutPromise<never>(config.captionBudgetMs ?? LLM_BUDGET_MS, `caption[${label}]`),
      ]);
      lastRaw = r.content ?? "";
      const parsed = tryParseJson(lastRaw);
      const out = extractCaption(lastRaw, parsed);
      if (out.caption.length > 0) {
        const caption = stripCaptionPreamble(out.caption);
        const sanity = detectNonDeliverable(caption, { isZhTW, structured: calendarMode, inputKeys });
        if (!sanity) {
          if (adCopy) {
            const issue = validateAdCopy(caption, requestedUrl);
            if (issue && attempt < 2) {
              // Contract miss on the first try → one strict retry (the
              // reminder below names the exact violation).
              lastErr = new Error(`ad-copy contract miss for ${label} (${issue.reason}): ${issue.detail}`);
              adCopyIssue = issue.detail;
              console.warn(`[callOneVariant] attempt ${attempt} contract miss for ${label} (${issue.reason}): ${lastRaw.slice(0, 300)}`);
              continue;
            }
            if (issue) {
              // Last attempt: ship what we have, deterministically repaired
              // (URL appended to [Primary]). Missing markers cannot be repaired.
              console.warn(`[callOneVariant] ad-copy contract still unmet for ${label} (${issue.reason}) — applying repair`);
              return { label, caption: repairAdCopy(caption, requestedUrl), hashtags: out.hashtags };
            }
          }
          if (adSlot) {
            const issue = validateAdSlot(caption, adSlot);
            if (issue && attempt < 2) {
              lastErr = new Error(`ad-slot contract miss for ${label} (${issue.reason}): ${issue.detail}`);
              adCopyIssue = issue.detail;   // 重試提醒沿用同一個欄位，措辭由 issue.detail 帶
              console.warn(`[callOneVariant] attempt ${attempt} ad-slot miss for ${label} (${issue.reason}): ${lastRaw.slice(0, 200)}`);
              continue;
            }
            if (issue) {
              // 最後一次：交出去的東西至少要放得進版面（按鈕只吃得下 12 字）。
              // 修補只做切割與搬移，不重寫語意——被切下來的字搬去「適合：」那行。
              console.warn(`[callOneVariant] ad-slot contract still unmet for ${label} (${issue.reason}) — applying repair`);
              return { label, caption: repairAdSlot(caption, adSlot), hashtags: out.hashtags };
            }
          }
          if (wuganVoice) {
            // skill 01 Hard Rule 1。規則已經在 systemPrompt 最前面，實測
            // 仍會滑回這個句型（一次三個變體共 8 處），所以照 adCopy /
            // shotList 的做法補一次具名重試，再不行才確定性修補。
            const issue = validateWuganVoice(caption);
            // 2026-08-31：重試只用在短文本。長文件（行事曆一次 3 篇大綱、
            // 案例一次 3 個提報）單次生成就要 45–100s，再生一份會撞破 caption
            // 預算，整個變體回空 —— 任務顯示成功、產出空白。實測 wg-cal-
            // eco-architecture 就是這樣掛掉的（attempt 1 命中 11 處 →
            // 重試 → final gate hasUsableVariant=false）。
            // 長文件直接走確定性修補：對比尾巴本來就是機械可刪的。
            const longForm = (config.captionMaxChars ?? 0) > 2000;
            if (issue && attempt < 2 && !longForm) {
              lastErr = new Error(`wugan voice contract miss for ${label} (${issue.pattern})`);
              wuganVoiceIssue = buildWuganVoiceReminder(issue);
              console.warn(`[callOneVariant] attempt ${attempt} wugan-voice miss for ${label} (${issue.pattern} x${issue.count})`);
              continue;
            }
            if (issue) {
              // 最後一次：把對比句的否定半邊機械性拿掉，保留肯定半邊。
              // 修不掉的形式會原樣留著 —— 修壞比留著更糟。
              console.warn(`[callOneVariant] wugan-voice still unmet for ${label} (${issue.pattern}) — applying repair`);
              return { label, caption: repairWuganVoice(caption), hashtags: out.hashtags };
            }
          }
          if (shotList) {
            // 先把「內容對、包裝爛」的回應（字面 \n、漏出來的 JSON 外殼、
            // 四行擠成一行）機械性救回來，再驗證 —— 否則會為了包裝問題
            // 白燒一次重試，而重試的結果通常比第一次差。
            const normalized = normalizeShotList(caption);
            const issue = validateShotList(normalized);
            if (issue && attempt < 2) {
              lastErr = new Error(`shot-list contract miss for ${label} (${issue.reason}): ${issue.detail}`);
              shotListIssue = issue.detail;
              console.warn(`[callOneVariant] attempt ${attempt} shot-list miss for ${label} (${issue.reason}): ${lastRaw.slice(0, 300)}`);
              continue;
            }
            if (issue) {
              // 最後一次：能修的只有 hashtag，格數/缺行修不了，照實出貨。
              console.warn(`[callOneVariant] shot-list contract still unmet for ${label} (${issue.reason}) — applying repair`);
              return { label, caption: repairShotList(caption), hashtags: [] };
            }
            // 出貨的是正規化後的版本 —— 原始那份還帶著逸出的換行字元與
            // JSON 外殼殘骸。
            return { label, caption: normalized, hashtags: [] };
          }
          // 版本名稱要對得上內文：pickOwnAngle 任務用模型自己回報的 label（falls back to the
          // config default if it didn't return one usable）；其他任務仍是原本指定的 label。
          // 數據版一定要用數字開場，沒有就帶著原因重寫一次；數字必須對得回素材。最後一次照實出貨
          // （不為了切角把整個變體弄成空白）。
          const effectiveLabel = config.pickOwnAngle ? sanitizeAngleLabel(out.label, label) : label;
          const angleMiss = checkAngle(effectiveLabel, caption, template.systemPrompt, [userMsg, urlContext, brandPrefix].join("\n"));
          if (angleMiss && attempt < 2) {
            lastErr = new Error(`angle miss for ${effectiveLabel}: ${angleMiss}`);
            angleIssue = angleMiss;
            console.warn(`[callOneVariant] attempt ${attempt} angle miss for ${effectiveLabel}: ${angleMiss}`);
            continue;
          }
          // dev 2026-08: strip draft-leak lines / internal snake_case keys
          // from the shipped caption. Only on this path — the contract
          // branches above return formats whose markers this would eat.
          return { label: effectiveLabel, caption: sanitizeCaption(caption), hashtags: out.hashtags };
        }
        lastErr = new Error(`non-deliverable caption for ${label} (${sanity.reason}) — raw[0:200]: ${lastRaw.slice(0, 200)}`);
        console.warn(`[callOneVariant] attempt ${attempt} rejected for ${label} (${sanity.reason}): ${lastRaw.slice(0, 300)}`);
      } else {
        lastErr = new Error(`empty caption for ${label} — raw[0:200]: ${lastRaw.slice(0, 200)}`);
        console.warn(`[callOneVariant] attempt ${attempt} failed for ${label} (raw len=${lastRaw.length}): ${lastRaw.slice(0, 300)}`);
      }
    } catch (e) {
      lastErr = e;
      console.warn(`[callOneVariant] attempt ${attempt} threw for ${label}:`, (e as Error)?.message);
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 250));
  }
  throw lastErr ?? new Error(`caption[${label}] exhausted retries`);
}

export async function callCaptionWriter(args: {
  template: FBTaskTemplate;
  config: OrchestraConfig;
  captionPersona: string;
  brandPrefix: string;
  urlContext: string;
  userMsg: string;
  inputKeys: readonly string[];
  agentAiModel?: string | null;
  strategistAnchor?: string;
  market?: MarketCode | null;
  isZhTW: boolean;
  requestedUrl?: string | null;
}): Promise<Array<{ label: string; caption: string; hashtags?: string[] }>> {
  const labels = args.config.variantLabels.slice(0, args.config.variants);
  // Parallel fanout — each variant in its own LLM call.
  // Promise.allSettled so one failure doesn't kill the others.
  const settled = await Promise.allSettled(
    labels.map((label) =>
      callOneVariant({ ...args, label, siblingLabels: labels }),
    ),
  );
  const results = settled.map((s, i) =>
    s.status === "fulfilled"
      ? s.value
      : { label: labels[i] ?? `版本 ${i + 1}`, caption: "", hashtags: undefined },
  );
  // 2026-09-22 實測（金安德森香氛）：pickOwnAngle 的三個獨立判斷常常選到同一個名字（三篇都叫「情感
  // 版」）——內容其實不同，但畫面上三個一樣的版本頁籤會讓人以為壞了。只調整顯示用的名字，不動內容。
  if (args.config.pickOwnAngle) dedupeAngleLabels(results);
  return results;
}

// Per-variant fanout: same reliability play as caption_writer. Each brief
// is its own tiny LLM call (~100 tokens). Failure isolated, retry per slot.
export async function callOneBrief(args: {
  template: FBTaskTemplate;
  config: OrchestraConfig;
  label: string;
  imagePersona: string;
  brandPrefix: string;
  urlContext: string;
  userMsg: string;
}): Promise<string> {
  const { config, label, imagePersona, brandPrefix, urlContext, userMsg } = args;
  const hasUrl = urlContext.length > 0;
  const subjectRule = hasUrl
    ? `視覺主題=URL 抓到的影片 / 文章內容。**不要**把品牌主商品畫進視覺。\n`
    : "";
  // 2026-05-17 (CJ「IG 視覺也要得獎工藝」): IG-family tasks get the
  // 【視覺 craft】 portion of the IG rubric so style direction follows
  // award-grade composition + correct aspect ratio + brand visual
  // identity. IG-gated — non-IG image flows unchanged.
  const igVisualBlock = isInstagramTask(args.template)
    ? `\n# IG 視覺工藝（嚴格遵守）\n` +
      `- 首屏鉤子：0.5 秒內讓人停下；高對比、單一焦點、留白給文字。\n` +
      `- 比例正確（${config.aspectRatio ?? "1:1"}），錯比例＝被裁切＝失敗。\n` +
      `- 構圖服務內容（封面承諾/輪播遞進/Reel 字卡空間）。\n` +
      `- 品牌視覺一致：色彩/字體/濾鏡/構圖語言與品牌大腦一致，可一眼認出。\n`
    : "";
  // 2026-05-18 (CJ「每個版本的圖應該要不一樣，現在都是一樣」): every
  // brief got the same userMsg + only a one-word tone label, so the 5
  // visuals converged. Give each label a CONCRETELY different visual
  // lens (subject framing / scene / composition / palette) and an
  // explicit must-differ rule so the set diverges.
  // 通用切角（情感／理性／故事／數據／懸念／反差）的視覺鏡頭跟文案寫法一起定義在
  // variantAngles.ts（同一張表），這裡只留倒數系列這種「只有畫面用得到」的日期鏡頭。
  const labelLens: Record<string, string> = {
    // 5天倒數系列 — 視覺隨日期升溫，第1天最強衝擊
    "第5天": "開闊介紹性構圖，品牌主視覺清晰，色彩溫和友善，傳遞「初次見面」的第一印象感",
    "第4天": "聚焦產品或服務核心細節，特寫鏡頭展示差異化，乾淨背景突出主體優勢",
    "第3天": "社群感與真實感，使用情境場景或人物見證，溫暖自然光，生活感真實瞬間",
    "第2天": "視覺緊迫感，高對比搶眼色彩，強調限時或獨家元素，色調比前幾天更飽和",
    "第1天": "最強視覺衝擊，戲劇光影與高飽和對比色，最終倒數的緊張感，聚焦單一明確行動",
  };
  const lens = angleVisualLens(label) ?? labelLens[label] ?? `緊扣「${label}」的獨特視覺概念，與其他版本明顯不同`;
  // 2026-08-23 (CJ 驗收 ig-60-live-event 的 7 段圖): run-of-show 任務的 label
  // 開頭是流程時間碼（"03:00-10:00 第一波衝刺" / "T-24h 預熱宣告"），視覺總監
  // 把它讀成一天中的時刻，於是「03:00」畫成凌晨檯燈、「10:00-18:00」畫成正午
  // 強光、「T-24h」畫成深夜沙漏 —— 整組圖在演時鐘，不是在演直播現場。
  const isTimecodeLabel = /^(T-\d+h|\d{1,2}:\d{2})/.test(label);
  const timecodeNote = isTimecodeLabel
    ? `\n【重要】「${label}」開頭的時間碼是「直播進行到第幾分鐘」，**不是一天中的時刻**。` +
      `絕對不要據此畫成凌晨 / 清晨 / 正午 / 深夜的光線或氛圍，也不要畫時鐘、沙漏、倒數計時器。` +
      `視覺要呼應這一段「正在做的事」（例如：正在拆箱、正在看留言、正在展示成分表）。\n`
    : "";
  // 2026-09-22（CJ「不應該將所有產品都規定為情感版、理性版還有數據版」）：pickOwnAngle 任務的文案
  // 是自己判斷切角、寫完才回報名稱的——這支視覺 brief 是獨立的另一次呼叫，並不知道文案最後選了什麼
  // 名字，如果還照「${label}」（config 的固定備用名）當「務必照此走」的硬性視覺切角，畫面說明可能
  // 對不上文案實際寫出來的東西。pickOwnAngle 時改成跟文案同一種自由判斷，不綁定某個固定角度。
  const angleLensLine = config.pickOwnAngle
    ? `這一支的視覺方向請你自己判斷最適合這個產品/主題的畫面（不用對應到固定的情感/理性/數據等分類，那是文案那邊另一支獨立判斷的結果，兩邊不會事先對齊）。\n`
    : `此版本的視覺切角（務必照此走，不要寫成通用品牌圖）：${lens}。\n`;
  const system =
    imagePersona +
    `任務：寫 1 條**繁體中文**視覺方向描述${config.pickOwnAngle ? "" : `，呼應「${label}」這個口吻`}。\n` +
    timecodeNote +
    angleLensLine +
    `這是一組多版本中的一篇，**必須與其他版本在主體、場景、構圖、色調上明顯不同**，不可雷同。\n` +
    `比例：${config.aspectRatio ?? "1:1"}\n` +
    igVisualBlock +
    subjectRule +
    // 2026-07-16 (CJ「七日發布台的是標準」): this Chinese brief is DISPLAY
    // ONLY (the UI 風格方向 text). The image-model prompt is derived from
    // the finished caption via captionToVisualBrief — theater's standard.
    `規則：30-60 字繁中、涵蓋主體 / 構圖 / 光線 / 色彩 / 氛圍、不要疊文字、不要 logo。\n\n` +
    `輸出嚴格 JSON 物件：{"summary":"<中文視覺描述>"}\n` +
    `第一個字元就是 {。不要 markdown code fence、不要前言。\n` +
    (hasUrl ? brandPrefix : `\n${brandPrefix}`) +
    (hasUrl ? `\n# URL 抓到的內容（主題來源）\n${urlContext}` : "");

  let attempt = 0;
  let lastErr: any = null;
  while (attempt < 2) {
    attempt++;
    try {
      const r = await Promise.race([
        callModel(
          [
            { role: "system", content: system },
            { role: "user", content: userMsg },
          ],
          undefined,
          "qwen",
        ),
        timeoutPromise<never>(LLM_BUDGET_MS, `brief[${label}]`),
      ]);
      const parsed = tryParseJson(r.content);
      const summary =
        typeof (parsed as any)?.summary === "string" ? (parsed as any).summary.trim() : "";
      if (summary.length > 0) return summary;
      // sometimes LLM returns string directly
      if (typeof r.content === "string" && r.content.trim().length > 0 && !r.content.includes("{")) {
        return r.content.trim().slice(0, 280);
      }
      lastErr = new Error(`empty brief for ${label}`);
    } catch (e) { lastErr = e; }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 200));
  }
  throw lastErr ?? new Error(`brief[${label}] exhausted retries`);
}

export async function callImageDirector(args: {
  template: FBTaskTemplate;
  config: OrchestraConfig;
  imagePersona: string;
  brandPrefix: string;
  urlContext: string;
  userMsg: string;
}): Promise<string[]> {
  const { config } = args;
  if (!config.imageDirectorId || config.images === 0) return [];

  // Per-variant fanout — same reliability mechanism as caption_writer.
  const labels = config.variantLabels.slice(0, config.images);
  const settled = await Promise.allSettled(
    labels.map((label) => callOneBrief({ ...args, label })),
  );
  return settled.map((s, i) =>
    s.status === "fulfilled" ? s.value : `（${labels[i] ?? `brief ${i + 1}`} brief 生成失敗 — 請點「用此風格生圖」自己描述）`,
  );
}

// ── Carousel / album cards: split ONE post into N cards ─────────────────
//
// 2026-05-18 (CJ「carousel 一個貼文還是只出現一張圖」): a carousel is one
// post made of N cards, each with its own headline + body + image. Given
// the generated post caption, split it into N cards (headline ≤14 / body
// ≤40) and a per-card visual brief. Conservative — only restructures the
// caption, no fabricated facts.
export async function callCarouselCards(args: {
  caption: string;
  topic: string;
  n: number;
  brandPrefix: string;
  imagePersona: string;
  aspectRatio: string;
  kind?: "carousel" | "storyboard";
}): Promise<Array<{ headline: string; body: string; imageBrief: string }>> {
  const { caption, topic, n, brandPrefix, imagePersona, aspectRatio, kind = "carousel" } = args;
  const isStoryboard = kind === "storyboard";
  const bodyMax = isStoryboard ? 160 : 90;
  const system =
    imagePersona +
    (isStoryboard
      ? `你是影片分鏡師。把下面這份逐鏡頭腳本，拆成正好 ${n} 格分鏡，維持原本的鏡頭順序（不要打亂、不要新增或刪減鏡頭）。\n` +
        `每格需要：\n` +
        `- headline：這格的簡短標籤（≤ 14 字，例："鏡頭 1・開場"）\n` +
        `- body：這格的時長＋畫面內容＋口白/字幕＋運鏡，整合成一段（≤ 90 字）\n` +
        `- image：這格畫面的視覺方向描述（30-60 字繁中，涵蓋主體/構圖/光線/色彩/氛圍，比例 ${aspectRatio}，不疊文字、不放 logo），要延續同一場景的推進，不要每格各自獨立無關\n` +
        `嚴格規則：只根據原始腳本拆解與重組，**不可新增或捏造鏡頭內容**。\n`
      : `你是輪播內容設計師。把下面這篇 FB 輪播貼文，拆成正好 ${n} 張卡，敘事弧：Hook → Build → Turn → Payoff → CTA。\n` +
        `每張卡需要：\n` +
        `- headline：≤ 14 字、強鉤、可單獨成立\n` +
        `- body：≤ 40 字、承接 headline、口語\n` +
        `- image：該卡的視覺方向描述（30-60 字繁中，涵蓋主體/構圖/光線/色彩/氛圍，比例 ${aspectRatio}，不疊文字、不放 logo），每張卡視覺要明顯不同\n` +
        `嚴格規則：只根據貼文內容拆解與重組，**不可新增或捏造事實**。\n`) +
    `輸出嚴格 JSON 陣列，長度正好 ${n}：[{"headline":"...","body":"...","image":"..."}, ...]\n` +
    `第一個字元就是 [。不要 markdown code fence、不要前言。\n` +
    brandPrefix;
  const userMsg = isStoryboard
    ? `主題：${topic}\n\n逐鏡頭腳本：\n${caption}`
    : `主題：${topic}\n\n輪播貼文：\n${caption}`;
  let attempt = 0;
  let lastErr: any = null;
  while (attempt < 2) {
    attempt++;
    try {
      const r = await Promise.race([
        callModel(
          [{ role: "system", content: system }, { role: "user", content: userMsg }],
          undefined,
          "qwen",
        ),
        timeoutPromise<never>(LLM_BUDGET_MS, "carousel-cards"),
      ]);
      const parsed = tryParseJson(r.content);
      const arr = Array.isArray(parsed) ? parsed : (parsed?.cards ?? parsed?.variants ?? []);
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.slice(0, n).map((c: any, i: number) => ({
          headline: String(c?.headline ?? c?.title ?? `卡 ${i + 1}`).trim().slice(0, 28),
          body: String(c?.body ?? c?.desc ?? c?.text ?? "").trim().slice(0, bodyMax),
          imageBrief: String(c?.image ?? c?.imageBrief ?? c?.visual ?? "").trim().slice(0, 280),
        }));
      }
      lastErr = new Error("empty cards");
    } catch (e) { lastErr = e; }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 200));
  }
  throw lastErr ?? new Error("carousel cards exhausted retries");
}

export async function callReplyTemplates(args: { caption: string; channel: string; n: number; persona?: string }): Promise<Array<{ userSays: string; yourReply: string }>> {
  const { caption, channel, n, persona } = args;
  const personaPrefix = persona ? `${persona}\n` : "";
  const system =
    personaPrefix +
    `你是社群留言策劃師。基於下面這篇即將發出的 ${channel} 貼文，預測 ${n} 種最可能的用戶留言（從正面到質疑都涵蓋），並寫出對應的品牌回覆。\n\n` +
    `每一組：用戶可能會說的話（30 字內，自然口吻）+ 品牌怎麼回（30-60 字，有溫度不罐頭）。\n\n` +
    `輸出嚴格 JSON 陣列：[{"userSays":"...","yourReply":"..."}, ...]\n` +
    `第一個字元是 [。不要 markdown 圍籬。\n`;
  try {
    const r = await Promise.race([
      callModel(
        [{ role: "system", content: system }, { role: "user", content: `貼文：\n${caption}` }],
        undefined,
        "qwen",
      ),
      timeoutPromise<never>(LLM_BUDGET_MS, "reply_templates"),
    ]);
    const parsed = tryParseJson(r.content);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, n).map((p: any) => ({
      userSays: String(p?.userSays ?? "").slice(0, 200),
      yourReply: String(p?.yourReply ?? "").slice(0, 400),
    })).filter((p) => p.userSays && p.yourReply);
  } catch { return []; }
}

export async function callPostingTime(args: { caption: string; channel: string; persona?: string }): Promise<string> {
  const { caption, channel, persona } = args;
  const personaPrefix = persona ? `${persona}\n` : "";
  const system =
    personaPrefix +
    `根據下面這篇 ${channel} 貼文的主題、語氣、對象，推薦 1 個最佳發文時段。\n` +
    `回答格式：「週X HH:MM-HH:MM｜理由（30 字內）」。例：「週四 19:00-21:00｜下班通勤後滑社群高峰，貼文輕鬆題材剛好接住」\n` +
    `不要列多個選項，只給最推薦的 1 個。`;
  try {
    const r = await Promise.race([
      callModel(
        [{ role: "system", content: system }, { role: "user", content: caption.slice(0, 800) }],
        undefined,
        "qwen",
      ),
      timeoutPromise<never>(8_000, "posting_time"),
    ]);
    return r.content.trim().slice(0, 200);
  } catch { return ""; }
}

export async function callFollowupPost(args: { caption: string; channel: string; persona?: string }): Promise<string> {
  const { caption, channel, persona } = args;
  const personaPrefix = persona ? `${persona}\n` : "";
  const system =
    personaPrefix +
    `這是即將發到 ${channel} 的主貼文。請寫一篇 24 小時後的追蹤貼文（80-150 字），延伸主貼文的對話：\n` +
    `- 不要重複主貼文重點\n- 可以是補充細節、回答留言常見問題、或下集預告\n- 語氣連貫\n` +
    `直接給追蹤貼文文字（不要加 prefix 像 "Day 2:"）。`;
  try {
    const r = await Promise.race([
      callModel(
        [{ role: "system", content: system }, { role: "user", content: caption.slice(0, 800) }],
        undefined,
        "qwen",
      ),
      timeoutPromise<never>(LLM_BUDGET_MS, "followup_post"),
    ]);
    return r.content.trim().slice(0, 800);
  } catch { return ""; }
}

export async function callStrategist(args: {
  template: FBTaskTemplate;
  strategistPersona: string;
  brandPrefix: string;
  urlContext: string;
  userMsg: string;
  postLabels: string[];
  /** 2026-08-22: what the writers are actually producing. Default keeps the
   *  original 「FB 系列貼文」/「篇」 wording for every existing task. */
  deliverable?: string;
  unit?: string;
}): Promise<string> {
  const { strategistPersona, brandPrefix, urlContext, userMsg, postLabels } = args;
  const deliverable = args.deliverable ?? "FB 系列貼文";
  const unit = args.unit ?? "篇";
  const system =
    `# 你的角色\n` +
    strategistPersona +
    `\n# 任務\n` +
    `用戶要產出${deliverable}（${postLabels.length} ${unit}）。你不寫 caption — 你寫整體「結構錨點」給後續寫手用。\n\n` +
    `產出 4-8 行繁體中文，涵蓋：\n` +
    `1) 整體 narrative 主題 / 核心訊息\n` +
    `2) 每${unit}的角色定位（${postLabels.map((l) => `「${l}」`).join(" / ")}）\n` +
    `3) ${unit}與${unit}之間的勾連邏輯（每${unit}結尾如何帶到下一${unit}）\n` +
    `4) 整體調性（情感 / 理性 / 緊湊 / 慢敘事 etc.）\n\n` +
    `直接給結構錨點文字，不要前言。\n` +
    (urlContext ? `\n# URL 內容\n${urlContext}` : "") +
    `\n# 品牌語氣\n${brandPrefix}`;
  try {
    const r = await Promise.race([
      callModel(
        [{ role: "system", content: system }, { role: "user", content: userMsg }],
        undefined,
        "qwen",
      ),
      timeoutPromise<never>(STRATEGIST_BUDGET_MS, "strategist"),
    ]);
    return r.content.trim().slice(0, 1500);
  } catch { return ""; }
}

export async function callCompareTable(args: { caption: string; viralSource: string; persona: string }): Promise<string> {
  const { caption, viralSource, persona } = args;
  const system =
    persona +
    `任務：用戶提供了一篇爆款原文，以及我們改寫後的品牌版。你寫一份 4-6 行對照分析：\n` +
    `- 原文 hook 機制 vs 改寫版 hook\n- 原文敘事結構 vs 改寫版結構\n- 情緒節奏對照\n- 品牌切入點是否自然\n` +
    `輸出純文字，不要 JSON、不要 markdown table。`;
  try {
    const r = await Promise.race([
      callModel(
        [{ role: "system", content: system }, { role: "user", content: `# 爆款原文\n${viralSource.slice(0, 800)}\n\n# 改寫版\n${caption.slice(0, 800)}` }],
        undefined,
        "qwen",
      ),
      timeoutPromise<never>(LLM_BUDGET_MS, "compare_table"),
    ]);
    return r.content.trim().slice(0, 1000);
  } catch { return ""; }
}

export async function callTimingAdvisor(args: { caption: string; trendTopic: string; persona: string }): Promise<string> {
  const { caption, trendTopic, persona } = args;
  const system =
    persona +
    `任務：分析這個時事題材的時效性，給品牌「現在發 / 等等發 / 不要發」的建議。\n` +
    `4-6 行繁中：① 時事熱度判斷 ② 發文時機建議（具體時間範圍）③ 風險點（敏感、過時、爭議）④ 加分點。\n` +
    `輸出純文字。`;
  try {
    const r = await Promise.race([
      callModel(
        [{ role: "system", content: system }, { role: "user", content: `# 時事題材\n${trendTopic.slice(0, 400)}\n\n# 改寫版貼文\n${caption.slice(0, 600)}` }],
        undefined,
        "qwen",
      ),
      timeoutPromise<never>(LLM_BUDGET_MS, "timing_advisor"),
    ]);
    return r.content.trim().slice(0, 1000);
  } catch { return ""; }
}

export async function callLegalAssistant(args: { caption: string; testimonialSource: string; consentStatus: string; persona: string }): Promise<string> {
  const { caption, testimonialSource, consentStatus, persona } = args;
  const system =
    persona +
    `任務：客戶見證改寫文的法務 / 倫理檢核。輸出 4-6 行繁中：\n` +
    `① 同意狀態判斷（已同意 / 需匿名 / 待確認）\n` +
    `② 改寫版有無違反原意 / 編造事實\n` +
    `③ 數字 / 成效宣稱是否有原文支持\n` +
    `④ 個資 / 識別資訊是否需脫敏\n` +
    `⑤ 風險評分（低 / 中 / 高）+ 1 句建議\n` +
    `輸出純文字。`;
  try {
    const r = await Promise.race([
      callModel(
        [{ role: "system", content: system }, { role: "user", content: `# 同意狀態\n${consentStatus || "未標示"}\n\n# 客戶原話\n${testimonialSource.slice(0, 600)}\n\n# 改寫版\n${caption.slice(0, 600)}` }],
        undefined,
        "qwen",
      ),
      timeoutPromise<never>(LLM_BUDGET_MS, "legal_assistant"),
    ]);
    return r.content.trim().slice(0, 1000);
  } catch { return ""; }
}
