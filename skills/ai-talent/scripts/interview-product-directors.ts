/**
 * interview-product-directors — 用真實品牌資料面試「產品頁策略總監」候選人。
 *
 * 2026-09-24（CJ「接下來是產品頁的人選，請列出十個候選名單，我想針對懶得煮的
 * 問題，要怎麼解決，只有牛舌賣得動的問題，進行面試」）：
 *
 * 選人不該只看職稱。這支把 10 位候選人的真實 mos_db 人設（名字／職稱／專長／
 * 【工作經歷】）各自組成 system prompt，配上「懶得煮的Tom老闆」真實的品牌大腦
 * 與產品清單，問同一題，把答案原樣印出來——誰答得出可執行的東西、誰只會講
 * 場面話，看答案就知道，不用猜。
 *
 * 跟正式對話的差別（要誠實講）：正式的策略總監對話走
 * strategistChatRouter.buildSystemPrompt，那裡會依「三個固定角色」加一段角度
 * 指示；這些候選人不屬於那三個 cohort，硬套會讓每個人都被塞成「品牌定位」的
 * 角度、面試就失真了。所以這裡只用「他自己的資料 + 品牌資料 + 題目」，沒有
 * 角色角度指示——面試看的正是「他自己的背景會把他帶到哪個角度」。
 *
 * 唯讀：只 SELECT，不寫任何東西（除了 LLM 呼叫本身會記 usage）。
 *
 * 用法（VM 上）：./node_modules/.bin/tsx scripts/interview-product-directors.ts [brandId]
 */
import localPool from "../server/localDb.js";
import { buildBrandPrefix } from "../server/strategy/core/brandContext.js";
import { buildBrandCatalogBlock } from "../server/strategy/core/brandCatalog.js";
import { callModel } from "../server/platform/core/multiModelRouter.js";

/**
 * 2026-09-24 第二輪（CJ「沒有專長於產品定位的人嗎?」）：第一輪那十位全是
 * 「行銷職能」（PMM/定價/CRM/歸因…），漏掉了 mos_db 裡真正以**產品定位方法論**
 * 命名的那一族（238xxx–239xxx，134 位「策略副總裁」：JTBD／Kano／VPC／FAB／
 * 品類設計／PMF／Dunford…）。這一族的資料特性跟產業族相反——方法論很明確，
 * 但幾乎都沒有【工作經歷】（只有 #238853 有）。兩族各面試一輪才比得出來。
 */
const PANELS: Record<string, Array<{ id: number; why: string }>> = {
  // 產品定位方法論族
  positioning: [
    { id: 238853, why: "產品價值主張副總裁 —— Osterwalder VPC（這族唯一有工作經歷的）" },
    { id: 238857, why: "Kano 產品策略副總裁 —— 必備/魅力/無差異，直接解釋為什麼某些品項不動" },
    { id: 239174, why: "JTBD 產品定位副總裁 —— 牛舌被「雇用」來完成什麼工作" },
    { id: 238855, why: "JTBD 產品策略副總裁 —— 同框架另一位，比較答案穩定度" },
    { id: 238856, why: "FAB 產品定位副總裁 —— 規格翻譯成銷售話術（商品頁寫法）" },
    { id: 238854, why: "產品利益階梯副總裁 —— Means-End，成分→功能→情感" },
    { id: 238861, why: "PMF 產品驗證副總裁 —— 其他品項是不是根本沒有 PMF" },
    { id: 238845, why: "品類設計策略副總裁 —— Play Bigger，你在賣牛舌還是賣「懶得煮」" },
    { id: 238864, why: "Dunford 定位策略副總裁 —— Obviously Awesome，定位的正統" },
    { id: 238878, why: "Segmentation 策略副總裁 —— 分眾，不同品項給不同人" },
  ],
  // 第一輪：行銷職能族（食品/電商 繁中，經歷厚但專長欄位多為 cohort 複製）
  marketing: [
  { id: 222877, why: "產品行銷經理（PMM）—— 產品 GTM 本業" },
  { id: 222873, why: "定價策略師 —— 組合包／搭售／訂閱結構" },
  { id: 223399, why: "CRM Lifecycle —— 買過牛舌的人怎麼帶到第二品項" },
  { id: 223544, why: "廣告歸因分析師 —— 其他品項是沒流量還是沒轉換" },
  { id: 222681, why: "轉換漏斗優化師 —— 漏斗哪一段掉" },
  { id: 222934, why: "競品情報分析師 —— 別家的品項結構怎麼排" },
  { id: 222594, why: "UX 研究員 —— 商品頁與選購流程" },
  { id: 223930, why: "品牌策略師 —— 「懶得煮＝牛舌店」的定位風險" },
  { id: 223909, why: "再行銷策略師 —— 既有客戶的第二次購買" },
  { id: 222875, why: "RevOps 收入營運 —— 客單價與毛利結構" },
  ],
};

const QUESTION = `我的商品裡只有「牛舌」賣得動，其他品項幾乎沒有人買。我該怎麼辦？

請照這個順序回答，每段都要具體：
1. 你的判斷：這到底是不是問題？（如果你認為不是問題，直接說，並說為什麼）
2. 你會先看哪三個數字才敢下判斷？（講得出是哪個報表的哪個欄位）
3. 你會建議的第一步是什麼？（一週內做得完的那種）
限 350 字以內，不要開場白，不要客套。`;

const FIELDS = [
  "id", "slug", "name", "name_zh", "title", "title_zh",
  "bio", "bio_zh", "experienceDetail", "specialty",
].join(", ");

async function loadAgent(id: number): Promise<any | null> {
  const [rows]: any = await localPool.execute(
    `SELECT ${FIELDS} FROM agents WHERE id = ? LIMIT 1`, [id],
  );
  return (rows as any[])[0] ?? null;
}

function personaPrompt(a: any, brandBlock: string): string {
  const name = a.name_zh || a.name;
  const title = a.title_zh || a.title;
  return [
    `你叫${name}，職稱是${title}。以第一人稱用這個身分回答，繁體中文，口語、直接、不要客套。`,
    a.specialty ? `你的專長：${a.specialty}` : "",
    a.experienceDetail ? `你的經歷：\n${a.experienceDetail}` : "",
    `只從你自己的專業角度回答——不是你的專長就說「這題要問誰」，不要硬答。`,
    `不要編客戶名字、數字、年份；經歷裡沒寫到的事不要當成自己做過。`,
    brandBlock ? `\n[品牌資料]\n${brandBlock}\n[/品牌資料]` : "",
  ].filter(Boolean).join("\n");
}

async function main() {
  const brandId = Number(process.argv[2] || 2972);   // 預設：懶得煮的Tom老闆
  const panelName = String(process.argv[3] || "marketing");
  const CANDIDATES = PANELS[panelName];
  if (!CANDIDATES) {
    console.error(`沒有這組名單：${panelName}（可用：${Object.keys(PANELS).join(" / ")}）`);
    process.exit(1);
  }
  console.log(`面試名單：${panelName}（${CANDIDATES.length} 位）`);
  const [brandRows]: any = await localPool.execute(
    `SELECT id, name, userId, industry FROM brands WHERE id = ? LIMIT 1`, [brandId],
  );
  const brand = (brandRows as any[])[0];
  if (!brand) { console.error(`brand ${brandId} not found`); process.exit(1); }

  console.log(`面試題目所用品牌：#${brand.id} ${brand.name}（${brand.industry ?? "未填產業"}）`);
  let brandBlock = "";
  try { brandBlock = (await buildBrandPrefix(brandId, null, null, "full")).trim(); } catch { /* 拿不到就空手面試 */ }
  try { brandBlock += `\n\n${await buildBrandCatalogBlock(brandId, Number(brand.userId))}`; } catch { /* 同上 */ }
  console.log(`品牌資料長度：${brandBlock.length} 字`);
  console.log(`題目：\n${QUESTION}`);
  console.log("=".repeat(78));

  for (const c of CANDIDATES) {
    const a = await loadAgent(c.id);
    if (!a) { console.log(`\n#${c.id} —— 這個 agent 不在 mos_db 裡了，跳過`); continue; }
    const name = a.name_zh || a.name;
    const title = a.title_zh || a.title;
    console.log(`\n── #${a.id} ${name}｜${title} ──`);
    console.log(`   入選理由：${c.why}`);
    const t0 = Date.now();
    try {
      const r = await callModel(
        [
          { role: "system" as const, content: personaPrompt(a, brandBlock) },
          { role: "user" as const, content: QUESTION },
        ],
        "general",
      );
      const text = String(r?.content ?? "").trim();
      console.log(`   （${((Date.now() - t0) / 1000).toFixed(1)}s，${text.length} 字）`);
      console.log(text.split(String.fromCharCode(10)).map((l) => `   ${l}`).join(String.fromCharCode(10)));
    } catch (e: any) {
      console.log(`   ✗ 這位答不出來（LLM 呼叫失敗）：${String(e?.message ?? e).slice(0, 160)}`);
    }
  }

  await localPool.end();
  process.exit(0);
}

main().catch((e) => { console.error("interview failed:", e); process.exit(1); });
