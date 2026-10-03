/**
 * scenePromptRefiner — 把使用者隨手寫的場景敘述，潤成一段夠具體的場景描述。
 *
 * 2026-09-24（CJ「當我們要客戶用產品照片做場景圖的時候，會因為她的提示詞不夠好，
 * 所以合成的圖片很糟糕，很AI。在描述場景時，請加入AI潤飾的按鈕，可以讓我們幫他
 * 補充提示詞，確認產出結果會好一些」）：
 *
 * 使用者在「用產品照片做場景圖」裡通常只寫「餐桌」「有人在吃」這種兩三個字。那不是
 * 他不會寫，是他不知道模型需要什麼——模型缺的是空間、光線、鏡頭、氛圍與人物行為的
 * 具體描述，缺了就自己補，補出來的就是那種一眼看穿的 AI 感。
 *
 * ── 刻意只潤「場景」這一段 ──────────────────────────────────────────────
 * imageGen.buildPrompt 已經在使用者這段文字的前後，自動加上產品保真指令、不要鏡像、
 * 攝影渲染語（editorial product photography／natural light／realistic contact
 * shadows…）。所以這裡**不准**再輸出那些技術詞——重複只會互相打架，而且會把使用者
 * 看得懂的那段話變成一坨行話。輸出只有：空間、光線、構圖、氛圍、人物行為。
 *
 * 也刻意不改寫成英文：使用者要看得懂才敢按下去（他得判斷這是不是他要的場景），而且
 * gpt-image-2 與 Nano Banana 對中文場景描述的理解足夠。
 *
 * 「提案不自動套用」：這支只回文字，要不要採用由前端讓使用者決定（可復原）。
 *
 * 放在 core 而不是寫在 router 裡：probe 要能跑**同一段程式**驗證產出品質，不是複製
 * 一份 prompt 來測——兩份 prompt 遲早會漂移，漂移那天測出來的就不是線上跑的東西。
 */
import { resolveBrandVisualContext } from "./imageGen";

export interface RefineSceneInput {
  brandId: number;
  userId: number;
  /** 有的話會把這支產品的定位帶進去，場景才貼得上它實際被使用的情境。 */
  productId?: number | null;
  scene: string;
}

const SYSTEM_PROMPT = `你是資深商業攝影的美術指導。使用者要用「自己拍的產品實照」生成一張場景圖，他寫的場景描述太簡略，你要把它補成一段足夠具體的場景描述。

**最高原則：你是在補，不是在改。** 使用者寫的每一個元素（人、物件、地點、時間、情緒）
都必須原樣保留並且變得更具體——不准刪掉、不准換成別的。使用者寫「一家人」，畫面裡就一定
要有那一家人；使用者寫「早晨」，就不准改成夜晚。品牌脈絡只用來決定「怎麼補」，不能用來
推翻使用者已經決定的事。

只輸出「場景」本身，寫成一段 60–120 字的繁體中文，包含這五件事：
1. 空間：在哪裡、桌面/背景材質、周圍有什麼物件（具體，例如「淺色橡木餐桌、後方虛化的廚房層架」）
2. 光線：光從哪來、軟硬、色溫（例如「左側窗光斜射，柔和、微暖」）
3. 構圖與鏡頭：視角高度、距離、景深（例如「45 度俯角、中近景、背景淺景深」）
4. 氛圍：時間感與情緒（例如「週末早晨、從容」）
5. 若使用者提到人：他們是誰、在做什麼具體動作、神情自然不看鏡頭（人數與關係要跟使用者寫的一致）

硬規則：
- **不要描述產品本身**（外觀、包裝、顏色、標籤）。產品是使用者提供的實照，描述它只會讓模型去重畫它。
- 不要寫攝影技術詞或渲染指令（不要寫 8K、超寫實、photorealistic、editorial、contact shadow、自然光攝影這類）。系統稍後會自動加，你重複只會互相打架。
- 不要出現任何文字、標語、logo、浮水印的指示。
- 不要提任何品牌名稱。
- 不要用「充滿溫馨氛圍」「令人垂涎」這種空泛形容詞，每一句都要是鏡頭拍得到的東西。
- **不要自己加酒精飲料、香菸、藥品、未成年人或寵物**——使用者沒提到就不要出現。這些東西
  會讓畫面直接不能用（品牌調性、廣告法規、平台審核），而且使用者根本沒要。
- 使用者沒提到人時不要加人；使用者提到人時，人一定要在畫面裡。
- 只回那段場景描述本身，不要標題、不要編號、不要引號、不要任何說明。`;

/** 產品自己的定位——場景要貼著這支產品在什麼情境被使用，不是泛泛的美圖。 */
async function productBlockOf(productId: number, brandId: number, userId: number): Promise<string> {
  try {
    const { default: localPool } = await import("../../../localDb");
    const [rows]: any = await localPool.execute(
      `SELECT p.name, p.positioning FROM products p
         JOIN brands b ON b.id = p.brandId
        WHERE p.id = ? AND p.brandId = ? AND b.userId = ? LIMIT 1`,
      [productId, brandId, userId],
    );
    const row = (rows as any[])[0];
    if (!row) return "";
    const pos = typeof row.positioning === "string"
      ? (() => { try { return JSON.parse(row.positioning); } catch { return null; } })()
      : row.positioning;
    const pick = (path: string): string => {
      let cur: any = pos;
      for (const k of path.split(".")) cur = cur?.[k];
      return typeof cur === "string" ? cur.trim().slice(0, 200) : "";
    };
    return [
      `產品名稱：${row.name}`,
      pick("core.zhTagline") ? `產品標語：${pick("core.zhTagline")}` : "",
      pick("core.coreStatement") ? `產品核心定位：${pick("core.coreStatement")}` : "",
      pick("audience.primary") ? `使用者：${pick("audience.primary")}` : "",
    ].filter(Boolean).join("\n");
  } catch {
    return "";   // 拿不到產品資料就只用品牌脈絡，不致命
  }
}

/**
 * 模型偶爾會加 code fence、引號或「場景：」開頭——那是格式雜訊不是內容。
 * 匯出給測試用：這段每一條都是實際看過的輸出形狀。
 */
export function cleanRefinedScene(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/^[「"']+/, "")
    .replace(/[」"']+$/, "")
    .replace(/^(場景|Scene)\s*[:：]\s*/i, "")
    .trim()
    .slice(0, 600);
}

/** 潤飾。潤不出東西就回空字串，由呼叫端決定怎麼說——不要回一段假的。 */
export async function refineScenePrompt(input: RefineSceneInput): Promise<string> {
  const resolved = await resolveBrandVisualContext(input.brandId);
  const { invokeLLM } = await import("../../../platform/core/llm/llm");

  const brandBlock = [
    resolved.brandName ? `品牌：${resolved.brandName}` : "",
    resolved.positioning ? `品牌定位：${String(resolved.positioning).slice(0, 300)}` : "",
    resolved.audience ? `目標受眾：${String(resolved.audience).slice(0, 200)}` : "",
    resolved.voiceTone ? `品牌語氣：${String(resolved.voiceTone).slice(0, 150)}` : "",
  ].filter(Boolean).join("\n");

  const productBlock = input.productId
    ? await productBlockOf(input.productId, input.brandId, input.userId)
    : "";

  const userMsg = [
    brandBlock ? `【品牌脈絡】\n${brandBlock}` : "",
    productBlock ? `【產品】\n${productBlock}` : "",
    `【使用者寫的場景】\n${input.scene.trim() || "（沒有寫，請依品牌與產品提一個最合適的日常使用情境）"}`,
  ].filter(Boolean).join("\n\n");

  const result = await invokeLLM({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMsg },
    ],
    maxTokens: 500,
  });

  return cleanRefinedScene(String(result.choices?.[0]?.message?.content ?? ""));
}
