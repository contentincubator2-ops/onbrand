/**
 * probe-brand-voice — 「丟參考文章學品牌寫法」的全鏈，在 DEV VM 上對真實品牌、真資料庫、
 * 正在跑的那個 server 跑一次（走 HTTP，所以驗到的是部署上去的程式）。
 *
 * 這支會真的花錢：分類 1 次、兩類各「反推 SKILL＋語氣常用詞＋試寫」、其中一類再
 * 「修 SKILL＋重寫」一輪，上架時每張卡畫一張插畫。只跑兩類就是為了把花費壓住。
 *
 * 驗的東西：
 *   1. classify 回得來；start 建出兩張 origin: voice 的卡，id 固定
 *   2. 兩張卡**同時**在背景跑，都走得到「等你看」（寫回同一個 JSON 欄位沒有互蓋）
 *   3. SKILL 夠長、試寫有內容、題目是這個品牌自己的
 *   4. voice 卡不佔自建卡額度（quickTask.channels 的已用數不變）
 *   5. 不像＋意見 → SKILL 真的改了、重寫了一篇、輪數 +1
 *   6. finish → 兩張卡上架、taskRegistry 解析得到、語氣寫進 _assets.voice、生文 prompt 讀得到
 *   7. 整個過程 positioning 其他 key 一個都沒被動到（JSON_SET 只改自己的 key）
 *
 * 安全性：開頭快照 positioning；finally 把 `_taskCards` 與 `_assets` 兩個 key 還原成快照的值
 * （只還原這兩個 key，不整欄蓋回——這幾分鐘內別人對其他 key 的修改不該被我們抹掉），
 * 然後比對這兩個 key 與快照一致。
 *
 * 用法（在 VM 上）：
 *   cd /opt/onbrand/current/skills/ai-talent
 *   ./node_modules/.bin/tsx scripts/probe-brand-voice.ts [brandId]
 */
import { SignJWT } from "jose";
import "./../server/bootstrap-env";
import localPool from "../server/localDb";
import { getJwtSecret } from "../server/platform/core/env";
import { resolveTask } from "../server/content/core/catalog/taskRegistry";
import { registerBrandTaskCardSource } from "../server/content/core/catalog/brandTaskCards";
import { VOICE_BLOCK_START, VOICE_BLOCK_END, voiceCardId } from "../server/content/core/catalog/brandVoice";
import { buildBrandPrefix } from "../server/strategy/core/brand/brandContext";

// probe 是獨立 process，taskRegistry 的來源要自己註冊（見 probe-task-card.ts）。
registerBrandTaskCardSource();

const BASE = process.env.PROBE_BASE ?? "http://127.0.0.1:3101";

let pass = 0, fail = 0;
function check(ok: boolean, label: string, detail = ""): void {
  if (ok) { pass++; console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ""}`); }
  else    { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`); }
}

let ARTICLES = [
  "嗨茶友們，新朋友報到！\n這支「山嵐冷泡烏龍」我們試了十幾輪才定下來。茶湯清清的，尾巴帶一點蘭花香，冰箱放一晚，隔天帶出門剛剛好。\n一包泡一瓶，不用算茶葉、不用看時間。\n喝起來順順的～\n\n#山茶日常 #冷泡茶",
  "嗨茶友們，蜜香紅茶回來了。\n夏天被小綠葉蟬咬過的茶葉，會自己長出蜜味，不加糖也甜甜的。早上配吐司、下午配餅乾都可以。\n這一批量不多，兩罐 499，喜歡的茶友手腳要快一點喔。\n喝起來順順的～\n\n#山茶日常 #蜜香紅茶",
  "嗨茶友們，很多人敲碗的隨身茶罐來了。\n霧面的、不沾指紋，大小剛好放得進包包側袋。蓋子有矽膠圈，倒過來也不會漏。\n裝茶葉、裝茶包都行，出門旅行帶著就不怕喝不到熟悉的味道。\n\n#山茶日常 #茶罐",
  "嗨茶友們，週一了。\n我們辦公室今天的狀態是：三個人泡茶、兩個人還在找杯子、一個人說他要喝咖啡（被瞪）。\n你們呢？週一都靠什麼撐過去？\n\n#山茶日常",
  "嗨茶友們，下雨天問個問題：\n熱茶派還是冷泡派？\n小編自己是冬天也喝冷泡的那種，常常被同事說怪。留言讓我知道我不孤單好嗎。\n\n#山茶日常",
];
let WANT: string[] | null = ["product", "product", "product", "chat", "chat"];
/** 第三個參數給 own：改用這個品牌既有任務卡裡的真實範例當文章（同一個品牌的文章配同一個品牌的大腦，才看得出像不像）。 */
const OWN = process.argv[3] === "own";

const parse = (p: any): any => {
  if (p == null) return {};
  if (typeof p === "string") { try { return JSON.parse(p) ?? {}; } catch { return {}; } }
  return p;
};
/** key 排序後的 JSON，比對用（JSON 欄位存回去 key 順序會變）。 */
const canon = (v: any): string => JSON.stringify(v, (_k, x) =>
  (x && typeof x === "object" && !Array.isArray(x)
    ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]]))
    : x));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const argBrand = parseInt(process.argv[2] ?? "", 10);

  console.log("=== 0. 挑一個真實品牌 ===");
  const [rows]: any = await localPool.execute(
    argBrand
      ? `SELECT id, name, userId FROM brands WHERE id = ? LIMIT 1`
      : `SELECT id, name, userId FROM brands WHERE positioning IS NOT NULL ORDER BY id DESC LIMIT 1`,
    argBrand ? [argBrand] : [],
  );
  const brand = (rows as any[])[0];
  if (!brand) { console.log("  ❌ 找不到品牌，中止"); process.exit(1); }
  console.log(`  品牌 #${brand.id}「${brand.name}」owner=${brand.userId}`);
  const [col]: any = await localPool.execute(`SHOW COLUMNS FROM brands LIKE 'positioning'`);
  console.log(`  positioning 欄位型別：${(col as any[])[0]?.Type}`);

  const readPos = async () => {
    const [r]: any = await localPool.execute(`SELECT positioning AS p FROM brands WHERE id = ? LIMIT 1`, [brand.id]);
    return parse((r as any[])[0]?.p);
  };
  const snap = await readPos();
  const others = (pos: any) => Object.fromEntries(Object.entries(pos).filter(([k]) => k !== "_taskCards" && k !== "_assets"));
  console.log(`  快照：${Object.keys(snap).length} 個頂層 key，既有任務卡 ${(snap._taskCards ?? []).length} 張，品牌口吻 ${String(snap._assets?.voice?.text ?? "").length} 字`);
  const preexisting = (snap._taskCards ?? []).filter((c: any) => c?.origin === "voice").length;
  if (preexisting > 0) console.log(`  ⚠ 這個品牌已經有 ${preexisting} 張 voice 卡；這次會覆蓋同類別的，結束時還原成快照`);

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(brand.userId))
    .setIssuedAt().setExpirationTime("30m")
    .sign(new TextEncoder().encode(getJwtSecret()));
  const unwrap = (r: Response, json: any) => ({
    ok: r.ok, status: r.status, data: json?.result?.data,
    err: json?.error?.message ?? json?.error?.json?.message,
  });
  const call = async (path: string, input: any) => {
    const r = await fetch(`${BASE}/trpc/${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return unwrap(r, await r.json().catch(() => ({})));
  };
  const query = async (path: string, input: any) => {
    const r = await fetch(`${BASE}/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`, { headers: { authorization: `Bearer ${token}` } });
    return unwrap(r, await r.json().catch(() => ({})));
  };
  const status = async (): Promise<any[]> => (await query("brandVoice.status", { brandId: brand.id })).data ?? [];
  if (OWN) {
    const seen = new Set<string>();
    ARTICLES = (snap._taskCards ?? [])
      .filter((c: any) => c?.origin !== "voice")
      .flatMap((c: any) => (Array.isArray(c?.samples) ? c.samples : []))
      .map((x: any) => String(x ?? "").trim())
      .filter((x: string) => x.length >= 20 && x.length <= 8000 && !seen.has(x) && !!seen.add(x))
      .slice(0, 14);
    WANT = null;
    console.log(`  改用這個品牌既有任務卡的真實範例：${ARTICLES.length} 篇（${ARTICLES.map((a) => a.length).join("、")} 字）`);
    if (ARTICLES.length < 4) { console.log("  ❌ 既有範例不到 4 篇，沒辦法做這個測試"); process.exit(1); }
  }
  let groups: { category: string; samples: string[] }[] = [
    { category: "product", samples: ARTICLES.slice(0, 3) },
    { category: "chat", samples: ARTICLES.slice(3) },
  ];
  let mine = [voiceCardId(brand.id, "product"), voiceCardId(brand.id, "chat")];
  /** 等指定的卡都離開「處理中」。回傳最後一次看到的狀態。 */
  const waitSettled = async (ids: string[], ms: number): Promise<any[]> => {
    const deadline = Date.now() + ms;
    let last: any[] = [];
    let lastLine = "";
    while (Date.now() < deadline) {
      await sleep(4000);
      last = (await status()).filter((c) => ids.includes(c.cardId));
      const line = last.map((c) => `${c.category}:${c.phase}`).join(" ");
      if (line !== lastLine) { console.log(`  … ${line}`); lastLine = line; }
      if (last.length === ids.length && last.every((c) => c.phase === "review" || c.phase === "failed")) break;
    }
    return last;
  };

  try {
    const usedBefore = (await query("quickTask.channels", { brandId: brand.id })).data?.ownCards?.used;

    console.log("\n=== 1. 自動分類 ===");
    const cls = await call("brandVoice.classify", { brandId: brand.id, articles: ARTICLES });
    check(cls.ok && Array.isArray(cls.data?.assignments), "classify 有回應", cls.ok ? `failed=${cls.data.failed}` : cls.err);
    const got: (string | null)[] = cls.data?.assignments ?? [];
    if (WANT) {
      const right = WANT.filter((w, i) => got[i] === w).length;
      check(right >= 4, `分對 ${right}/5`, got.join(","));
    } else {
      got.forEach((g, i) => console.log(`  [${i + 1}] ${g ?? "未分類"}｜${ARTICLES[i]!.replace(/\s+/g, " ").slice(0, 40)}`));
      const by = new Map<string, string[]>();
      got.forEach((g, i) => { if (g) by.set(g, [...(by.get(g) ?? []), ARTICLES[i]!]); });
      // 分類結果裡篇數最多的兩類（每類至少 2 篇）；湊不到兩類就把全部文章對半當兩類，照樣驗流程。
      const top = [...by.entries()].filter(([, v]) => v.length >= 2).sort((a, b) => b[1].length - a[1].length).slice(0, 2);
      if (top.length === 2) groups = top.map(([category, samples]) => ({ category, samples: samples.slice(0, 5) }));
      else {
        const half = Math.ceil(ARTICLES.length / 2);
        groups = [{ category: "product", samples: ARTICLES.slice(0, half).slice(0, 5) }, { category: "chat", samples: ARTICLES.slice(half).slice(0, 5) }];
        console.log("  分類後不到兩類各 2 篇，改把文章對半分成兩類來驗流程");
      }
      mine = groups.map((g) => voiceCardId(brand.id, g.category as any));
      console.log(`  用來學的兩類：${groups.map((g) => `${g.category}×${g.samples.length}`).join("、")}`);
    }

    console.log("\n=== 2. 開始學（兩類同時在背景跑）===");
    const started = await call("brandVoice.start", {
      brandId: brand.id, channel: "facebook",
      groups,
    });
    check(started.ok && canon(started.data?.cardIds) === canon(mine), "建出兩張卡，id 固定", started.ok ? started.data.cardIds.join(", ") : started.err);
    if (!started.ok) throw new Error("start 失敗，後面沒得驗");

    const t0 = Date.now();
    let cards = await waitSettled(mine, 240_000);
    console.log(`  兩類學完花了 ${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
    for (const c of cards) if (c.phase === "failed") console.log(`  ${c.category} 失敗原因：${c.error}`);
    check(cards.length === 2 && cards.every((c) => c.phase === "review"), "兩張卡都走到「等你看」（同時寫回沒有互蓋）", cards.map((c) => `${c.category}:${c.phase}`).join(" "));

    const pos1 = await readPos();
    const stored = (pos1._taskCards ?? []).filter((c: any) => mine.includes(c.id));
    check(stored.length === 2 && stored.every((c: any) => c.origin === "voice" && c.status === "drafting"), "資料庫裡是兩張 origin: voice、未上架的卡");
    for (const c of stored) {
      check(String(c.skill ?? "").length >= 200, `${c.voice?.category} 的 SKILL 夠長`, `${String(c.skill ?? "").length} 字`);
    }
    for (const c of cards) {
      console.log(`\n  【${c.category}】${c.measured.count} 篇｜${c.measured.minChars}–${c.measured.maxChars} 字｜題目：${c.topic}`);
      console.log(`  語氣：${c.profile?.tone ?? "（沒量出來）"}`);
      console.log(`  結構：${c.profile?.structure ?? "（沒量出來）"}`);
      console.log(`  常用詞：${(c.profile?.phrases ?? []).map((p: any) => `${p.text}×${p.count}`).join("、") || "（無）"}`);
      if (OWN) console.log(`  原文第 1 篇（${c.samples[0].length} 字）：\n${String(c.samples[0]).split("\n").map((l: string) => `    ${l}`).join("\n")}`);
      console.log(`  試寫（${String(c.trial ?? "").length} 字，${c.trialInRange ? "在區間內" : "不在區間內"}）：\n${String(c.trial ?? "").split("\n").map((l: string) => `    ${l}`).join("\n")}`);
      check(String(c.trial ?? "").length >= 30, `${c.category} 試寫有內容`);
      check(!String(c.trial ?? "").includes("499"), `${c.category} 試寫沒有冒出範例的價格`);
    }
    check(canon(others(pos1)) === canon(others(snap)), "positioning 其他 key 沒被動到");

    const usedMid = (await query("quickTask.channels", { brandId: brand.id })).data?.ownCards?.used;
    check(usedMid === usedBefore, "voice 卡不佔自建卡額度", `已用 ${usedBefore} → ${usedMid}`);

    console.log("\n=== 3. 不像＋哪裡不像 → 修 SKILL → 重寫 ===");
    const skillBefore = String(stored.find((c: any) => c.id === mine[1])?.skill ?? "");
    const trialBefore = cards.find((c) => c.cardId === mine[1])?.trial;
    const noNote = await call("brandVoice.feedback", { brandId: brand.id, cardId: mine[1], verdict: "unlike", note: "" });
    check(!noNote.ok, "不像但沒說哪裡不像會被擋", noNote.err ?? "");
    const fb = await call("brandVoice.feedback", { brandId: brand.id, cardId: mine[1], verdict: "unlike", note: "結尾一定是丟一個問題給茶友回答，而且全篇不用驚嘆號、不用 emoji" });
    check(fb.ok && fb.data?.revising === true, "送出意見，開始修", fb.err ?? "");
    const after = (await waitSettled([mine[1]!], 180_000))[0];
    const skillAfter = String(((await readPos())._taskCards ?? []).find((c: any) => c.id === mine[1])?.skill ?? "");
    check(after?.phase === "review" && after?.rounds === 1, "修完回到「等你看」，輪數 1", `${after?.phase} rounds=${after?.rounds}${after?.error ? ` ${after.error}` : ""}`);
    check(skillAfter.length >= 200 && skillAfter !== skillBefore, "SKILL 真的改了", `${skillBefore.length} → ${skillAfter.length} 字`);
    check(!!after?.trial && after.trial !== trialBefore, "重寫了一篇");
    console.log(`  重寫（${String(after?.trial ?? "").length} 字）：\n${String(after?.trial ?? "").split("\n").map((l: string) => `    ${l}`).join("\n")}`);
    check(!/[!！]/.test(String(after?.trial ?? "")), "重寫的那篇沒有驚嘆號（照意見修）");
    console.log(`  重寫後字數 ${String(after?.trial ?? "").length}，原文區間 ${after?.measured?.minChars}–${after?.measured?.maxChars}（${after?.trialInRange ? "在區間內" : "不在區間內"}）`);

    console.log("\n=== 4. 確認 → 上架＋寫進品牌大腦 ===");
    const early = await call("brandVoice.finish", { brandId: brand.id });
    check(!early.ok, "一類都沒按像，不能完成", early.err ?? "");
    // 失敗狀態的卡不能按像（否則沒驗過的寫法會被上架）。這裡用還在 review 的卡驗正常路徑。
    for (const id of mine) {
      const like = await call("brandVoice.feedback", { brandId: brand.id, cardId: id, verdict: "like" });
      check(like.ok, `${id} 按像`, like.err ?? "");
    }
    const fin = await call("brandVoice.finish", { brandId: brand.id });
    check(fin.ok && fin.data?.published?.length === 2 && fin.data?.voiceWritten === true, "finish：兩張上架、語氣已寫入", fin.err ?? "");

    const pos2 = await readPos();
    const live = (pos2._taskCards ?? []).filter((c: any) => mine.includes(c.id));
    check(live.length === 2 && live.every((c: any) => c.status === "ready"), "兩張卡 status = ready");
    for (const id of mine) {
      const r = await resolveTask(id);
      check(!!r && r.template.systemPrompt.length >= 200, `taskRegistry 解析得到 ${id}`, r ? `source=${r.source}` : "null");
    }
    const voiceText = String(pos2._assets?.voice?.text ?? "");
    const prevText = String(snap._assets?.voice?.text ?? "");
    check(voiceText.includes(VOICE_BLOCK_START) && voiceText.includes(VOICE_BLOCK_END), "品牌口吻裡有我們那一段");
    check(!prevText.trim() || voiceText.includes(prevText.replace(new RegExp(`${VOICE_BLOCK_START}[\\s\\S]*?${VOICE_BLOCK_END}`), "").trim()), "原本寫在品牌口吻裡的內容還在");
    console.log(`  品牌口吻現在 ${voiceText.length} 字：\n${voiceText.slice(voiceText.indexOf(VOICE_BLOCK_START)).split("\n").map((l) => `    ${l}`).join("\n")}`);
    const assetsOther = (a: any) => Object.fromEntries(Object.entries(a ?? {}).filter(([k]) => k !== "voice"));
    check(canon(assetsOther(pos2._assets)) === canon(assetsOther(snap._assets)), "_assets 其他格沒被動到");
    check(canon(others(pos2)) === canon(others(snap)), "positioning 其他 key 沒被動到");
    const prefix = await buildBrandPrefix(brand.id).catch(() => "");
    check(prefix.includes(VOICE_BLOCK_START), "生文 prompt（品牌大腦）讀得到這一段", `prefix ${prefix.length} 字`);
  } finally {
    console.log("\n=== 5. 還原 ===");
    // 上架會在背景畫插畫並寫回卡片；還原之後那筆寫回找不到卡就是 no-op，但若它剛好
    // 卡在讀與寫之間會把卡寫回來，所以還原後再等一輪、再還原一次。
    const restore = async () => {
      for (const key of ["_taskCards", "_assets"] as const) {
        if (snap[key] === undefined) {
          await localPool.execute(`UPDATE brands SET positioning = JSON_REMOVE(positioning, '$.${key}') WHERE id = ?`, [brand.id]);
        } else {
          await localPool.execute(
            `UPDATE brands SET positioning = JSON_SET(positioning, '$.${key}', CAST(? AS JSON)) WHERE id = ?`,
            [JSON.stringify(snap[key]), brand.id],
          );
        }
      }
    };
    await restore();
    console.log("  等背景插畫結束（最多 60 秒）再確認一次…");
    await sleep(60_000);
    await restore();
    const back = await readPos();
    check(canon(back._taskCards) === canon(snap._taskCards), "_taskCards 還原成快照");
    check(canon(back._assets) === canon(snap._assets), "_assets 還原成快照");
  }

  console.log(`\n${fail === 0 ? "PROBE OK" : "PROBE FAILED"} — ${pass} 過 / ${fail} 沒過`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("PROBE CRASHED", e); process.exit(2); });
