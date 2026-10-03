/**
 * visualStyleFromImages — 使用者上傳幾張「我喜歡的樣子」，AI 把它變成可以用的風格描述。
 *
 * 2026-09-26（CJ「圖像風格、圖示風格，可以是按下任務卡以後，跳出來的視窗，是讓
 * 用戶自己上傳偏好的風格後，AI 自己訓練出風格的描述，轉換成 AI 提示詞」）。
 *
 * ── 兩種產出，用途不同 ───────────────────────────────────────────────
 *   description：繁中，給使用者看的——他要看得懂才知道 AI 抓對了沒有。
 *   prompt：英文，接在生圖 prompt 後面的那一段（模型對英文風格詞的理解穩定得多）。
 * 兩段分開存，因為它們的讀者不同；把一段當兩段用，結果是使用者看不懂、模型也吃不準。
 *
 * ── 只描述「風格」，不描述「內容」 ───────────────────────────────────
 * 使用者上傳的參考圖裡有具體的人、產品、場景。如果 AI 把那些寫進描述，之後每張生成
 * 圖都會長出參考圖裡的東西——那是抄，不是風格。所以 prompt 明確禁止描述畫面內容，
 * 只留光線、色調、構圖、材質、後製感這些可以轉移的東西。
 *
 * ── 讀圖是真的讀圖 ───────────────────────────────────────────────────
 * 圖片轉成 base64 data URL 餵給有視覺能力的模型（llm.ts 的 image_url → Anthropic
 * base64 轉換）。**不是**拿檔名或既有欄位去猜——猜出來的風格描述看起來一樣像真的，
 * 但跟使用者上傳的圖無關。
 */
import { fetchImageBuffer } from "../../platform/core/media/imageFetch";

export type StyleKind = "imagery" | "icon";

export interface StyleResult {
  /** 繁中、給人看的風格描述。 */
  description: string;
  /** 英文、接進生圖 prompt 的那一段。 */
  prompt: string;
  /** 真的被讀進去的圖片數（跟使用者上傳的張數可能不同——有的抓不到）。 */
  usedImages: number;
}

/** 一次最多讀幾張：再多對描述幫助有限，但每一張都是 token 與時間。 */
export const MAX_STYLE_IMAGES = 5;

const SYSTEM: Record<StyleKind, string> = {
  imagery: `你是資深美術指導。使用者給你幾張他喜歡的參考圖，你要歸納出**可以轉移到其他照片**的視覺風格。

只寫風格，不要寫畫面內容：
- 要寫：光線（方向／軟硬／色溫）、色調與飽和度、構圖與景深、材質與質感、後製感（顆粒、對比、暗角）、整體氛圍。
- **不要寫**參考圖裡有什麼人、什麼產品、什麼場景、什麼文字——那些是內容，寫進去之後每張新圖都會長出別人的東西。
- 不要寫品牌名稱、不要猜產業。
- 幾張圖不一致時，寫**它們共同的那部分**，並在描述裡老實說哪一點不一致。`,
  icon: `你是資深視覺設計師。使用者給你幾張他喜歡的圖示／符號，你要歸納出可以套用到整套圖示的風格規則。

只寫風格規則：線條粗細與端點、圓角、填色方式（線稿／實心／雙色）、幾何或手繪感、格線與留白、配色邏輯、細節密度。
**不要寫**那些圖示各自畫的是什麼東西（一個信封、一台相機…）——那是內容不是風格。
不要寫品牌名稱。幾張不一致時寫共同點，並老實指出不一致的地方。`,
};

const ASK: Record<StyleKind, string> = {
  imagery: `請歸納這些參考圖的攝影／影像風格。只輸出 JSON：
{"description":"繁體中文風格描述，120-200字，只講光線/色調/構圖/質感/氛圍","prompt":"English style directive for an image model, 25-60 words, style only — no subjects, no scene content, no brand names"}`,
  icon: `請歸納這些圖示的風格規則。只輸出 JSON：
{"description":"繁體中文風格描述，80-150字，只講線條/圓角/填色/幾何感/配色邏輯","prompt":"English icon-style directive, 20-45 words, style only — never name what the icons depict"}`,
};

function parseJson(raw: string): any {
  const text = String(raw ?? "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1]! : text).trim();
  try { return JSON.parse(body); } catch { /* fall through */ }
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(body.slice(start, end + 1)); } catch { /* noop */ }
  }
  return null;
}

/**
 * 把圖片讀成 data URL。抓不到的就跳過——一張抓不到不該讓整個功能失敗，
 * 但**全部都抓不到就要丟錯**：那時候產出的任何描述都是憑空想的。
 */
async function toDataUrls(urls: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const u of urls.slice(0, MAX_STYLE_IMAGES)) {
    try {
      const { buffer, mime } = await fetchImageBuffer(u, { maxBytes: 8 * 1024 * 1024 });
      out.push(`data:${mime};base64,${buffer.toString("base64")}`);
    } catch { /* 這一張跳過 */ }
  }
  return out;
}

export async function describeVisualStyle(args: {
  kind: StyleKind;
  imageUrls: string[];
}): Promise<StyleResult> {
  if (!args.imageUrls?.length) throw new Error("請先上傳至少一張參考圖");
  const dataUrls = await toDataUrls(args.imageUrls);
  if (dataUrls.length === 0) {
    throw new Error("這幾張圖都讀不到（連結可能已失效），請重新上傳");
  }

  const { invokeLLM } = await import("../../platform/core/llm");
  const r = await invokeLLM({
    messages: [
      { role: "system", content: SYSTEM[args.kind] },
      {
        role: "user",
        content: [
          { type: "text", text: ASK[args.kind] },
          ...dataUrls.map((url) => ({ type: "image_url" as const, image_url: { url } })),
        ] as any,
      },
    ],
    maxTokens: 700,
  });

  const parsed = parseJson(String(r.choices?.[0]?.message?.content ?? ""));
  const description = typeof parsed?.description === "string" ? parsed.description.trim() : "";
  const prompt = typeof parsed?.prompt === "string" ? parsed.prompt.trim() : "";
  if (!description && !prompt) {
    throw new Error("這次沒有歸納出風格，請再試一次或換幾張參考圖");
  }
  return {
    description: description.slice(0, 600),
    prompt: prompt.slice(0, 400),
    usedImages: dataUrls.length,
  };
}
