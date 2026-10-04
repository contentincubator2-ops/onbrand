/**
 * repProfile — 每位業務的履歷、個人寫法、照片，以及「品牌大腦 Access」入口。
 *
 * 2026-10-04 (CJ「平台看不到每個銷售人員的人設」「銷售的列表，每個人都是一張
 * avatar 照片，點進去有履歷，也有該人的品牌大腦 Access QR CODE」)。
 *
 * 為什麼人設要進 prompt：同一個方案、同一套公司規則，一百個業務寫出來一模一樣，
 * 在 LinkedIn 上一眼就被認出是 AI 稿，業務也不會想用。分工是：
 *   公司決定「說什麼」——價格、用詞、合規（政策包、核准價目、用詞表）
 *   業務決定「怎麼說」——語氣、經歷、可以講的客戶故事
 * 衝突的時候公司規則永遠贏。所以人設在 prompt 裡排在所有公司規則之後，並且
 * 明講「個人風格不能推翻上面任何一條」。
 *
 * 故事欄位刻意不放數字：合規契約會把統計數字跟核准市場數據逐條對，業務隨手
 * 寫的「幫客戶省了 30%」沒有出處，只會讓每篇都被擋。prompt 也明講不要從故事
 * 裡引用數字。
 */

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { exec, q, type HubRep } from "./hubStore";

export interface RepExperience {
  role: string;
  company: string;
  period: string;
  highlight: string;
}

export interface RepProfile {
  /** 一句話介紹自己，例如「幫零售老闆把數位工具用起來的人」。 */
  headline: string;
  location: string;
  yearsExperience: number | null;
  languages: string[];
  bio: string;
  expertise: string[];
  experience: RepExperience[];
  education: string;
  achievements: string[];
  /** 可以拿來寫的客戶故事。不放數字，見檔頭。 */
  stories: string[];
  voice: { tone: string; traits: string[]; signoff: string };
  /** 這個人自己不講的話——個人底線，疊在公司的禁用詞之上。 */
  avoid: string[];
}

export const EMPTY_PROFILE: RepProfile = {
  headline: "",
  location: "",
  yearsExperience: null,
  languages: [],
  bio: "",
  expertise: [],
  experience: [],
  education: "",
  achievements: [],
  stories: [],
  voice: { tone: "", traits: [], signoff: "" },
  avoid: [],
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown, maxItems: number, maxLen: number) =>
  Array.isArray(v) ? v.map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems) : [];

/** 資料庫裡的 JSON 不一定完整（舊列、手改過的列），一律走這裡補齊。 */
export function normaliseRepProfile(raw: unknown): RepProfile {
  let o: any = raw;
  if (typeof raw === "string") {
    try { o = JSON.parse(raw); } catch { o = null; }
  }
  if (!o || typeof o !== "object") return { ...EMPTY_PROFILE, voice: { ...EMPTY_PROFILE.voice } };
  const years = Number(o.yearsExperience);
  return {
    headline: str(o.headline, 160),
    location: str(o.location, 80),
    yearsExperience: Number.isFinite(years) && years >= 0 && years < 60 ? Math.round(years) : null,
    languages: list(o.languages, 6, 30),
    bio: str(o.bio, 1200),
    expertise: list(o.expertise, 10, 60),
    experience: Array.isArray(o.experience)
      ? o.experience.slice(0, 6).map((e: any) => ({
          role: str(e?.role, 100),
          company: str(e?.company, 100),
          period: str(e?.period, 40),
          highlight: str(e?.highlight, 240),
        })).filter((e: RepExperience) => e.role || e.company)
      : [],
    education: str(o.education, 160),
    achievements: list(o.achievements, 6, 200),
    stories: list(o.stories, 6, 400),
    voice: {
      tone: str(o.voice?.tone, 200),
      traits: list(o.voice?.traits, 6, 80),
      signoff: str(o.voice?.signoff, 120),
    },
    avoid: list(o.avoid, 10, 80),
  };
}

/**
 * 人設完整度：總部在名單上一眼看出「誰的 AI 還寫不出他自己的樣子」。
 * 只算會進 prompt 或會被訪客看到的欄位，各一分。
 */
export function profileCompleteness(p: RepProfile): number {
  const checks = [
    p.headline, p.bio, p.expertise.length, p.experience.length,
    p.stories.length, p.voice.tone, p.voice.traits.length, p.avoid.length,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

/** 給 generateRepPost 的「發文者」段落。沒填的欄位不出現，不寫成空白標籤。 */
export function personaPromptLines(rep: Pick<HubRep, "name" | "title" | "team">, p: RepProfile, zh: boolean): string[] {
  const lines = [`${rep.name}, ${rep.title} (${rep.team})`];
  const add = (labelEn: string, labelZh: string, value: string) => {
    if (value) lines.push(`${zh ? labelZh : labelEn}: ${value}`);
  };
  add("Who they are", "這個人", p.headline);
  if (p.yearsExperience != null) add("Years in the field", "年資", String(p.yearsExperience));
  add("Expertise", "專長", p.expertise.join(", "));
  add("Voice", "語氣", p.voice.tone);
  add("Writing habits", "寫作習慣", p.voice.traits.join("; "));
  add("Usual sign-off", "慣用結尾", p.voice.signoff);
  if (p.stories.length) {
    lines.push(zh ? "可以引用的親身經歷（擇一，與方案相關才用）：" : "First-hand stories they can draw on (use at most one, only if relevant):");
    lines.push(...p.stories.map((s) => `- ${s}`));
  }
  add("Never says", "個人不講的話", p.avoid.join(", "));
  if (lines.length > 1) {
    lines.push(
      zh
        ? "用這位業務的第一人稱與語氣來寫，讓熟悉他的人讀得出是他。上面的公司規則（價格、數據、用詞、政策）永遠優先於個人風格。不要從個人經歷裡引用或編造任何數字，也不要補充經歷裡沒有的細節。"
        : "Write in this rep's first-person voice so people who know them would recognise it. The company rules above (prices, statistics, wording, policy) always override personal style. Never quote or invent numbers from their stories, and don't add details the stories don't contain.",
    );
  }
  return lines;
}

// ── storage ─────────────────────────────────────────────────────────────────

export async function getRepProfileRow(repId: number): Promise<{ profile: RepProfile; photoKey: string | null } | null> {
  const [row] = await q(`SELECT profile, photo_key FROM hub_reps WHERE id = ? LIMIT 1`, [repId]);
  if (!row) return null;
  return { profile: normaliseRepProfile(row.profile), photoKey: row.photo_key ?? null };
}

export async function saveRepProfile(repId: number, profile: RepProfile): Promise<void> {
  await exec(`UPDATE hub_reps SET profile = ? WHERE id = ?`, [JSON.stringify(normaliseRepProfile(profile)), repId]);
}

export const photoUrl = (key: string | null | undefined) => (key ? `/hub-photo/${key}.jpg` : null);

/** 前端送來的是縮過的 data URL；這裡只認圖片 MIME，並再擋一次大小。 */
const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
export const MAX_PHOTO_CHARS = 700_000; // ≈ 500 KB 的圖

export async function setRepPhoto(repId: number, dataUrl: string | null): Promise<string | null> {
  if (dataUrl === null) {
    await exec(`UPDATE hub_reps SET photo = NULL, photo_key = NULL WHERE id = ?`, [repId]);
    return null;
  }
  if (dataUrl.length > MAX_PHOTO_CHARS || !PHOTO_RE.test(dataUrl)) {
    throw new Error("Photo must be a JPEG, PNG or WebP image under 500 KB.");
  }
  const key = randomBytes(12).toString("hex");
  await exec(`UPDATE hub_reps SET photo = ?, photo_key = ? WHERE id = ?`, [dataUrl, key, repId]);
  return key;
}

export async function readPhotoByKey(key: string): Promise<{ mime: string; body: Buffer } | null> {
  if (!/^[a-f0-9]{24}$/.test(key)) return null;
  const [row] = await q(`SELECT photo FROM hub_reps WHERE photo_key = ? LIMIT 1`, [key]);
  const m = String(row?.photo ?? "").match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  return m?.[1] && m[2] ? { mime: m[1], body: Buffer.from(m[2], "base64") } : null;
}

/**
 * 示範業務的 AI 頭像。只給 is_demo 的虛構業務用——替真實的員工「生成」一張臉
 * 不是我們該做的事，真人一律自己上傳照片。生成結果壓成 512px JPEG 存進資料庫，
 * 不依賴 covers 目錄（demo VM 只保留兩個 release，檔案路徑不可靠）。
 */
export async function generateDemoPortrait(rep: HubRep, p: RepProfile): Promise<string> {
  if (!rep.isDemo) throw new Error("AI portraits are only for fictional demo reps. Upload a real photo instead.");
  const { dispatchGenerate } = await import("../../../content/core/mediaGen");
  const where = rep.market === "TW" ? "Taiwanese" : "American";
  const prompt = [
    `Professional corporate headshot of a fictional ${where} B2B sales professional, ${rep.title}.`,
    p.headline ? `Personality: ${p.headline}.` : "",
    p.voice.tone ? `Expression that fits this tone: ${p.voice.tone}.` : "",
    "Head and shoulders, centered, looking at the camera, natural friendly smile, business casual attire,",
    "soft studio lighting, plain warm light-grey background, photorealistic, shallow depth of field.",
    "No text, no logo, no watermark.",
  ].filter(Boolean).join(" ");
  const r = await dispatchGenerate("google/nano-banana", { prompt, aspectRatio: "1:1" });
  if (r.status !== "ready" || (!r.url && !r.b64)) throw new Error(r.errorMsg || "Portrait generation failed. Try again, or upload a photo.");

  let buf: Buffer;
  if (r.b64) {
    buf = Buffer.from(r.b64, "base64");
  } else {
    const url = r.url!;
    const prefix = process.env.COVERS_URL_PREFIX ?? "/static/covers";
    if (url.startsWith(`${prefix}/`)) {
      const dir = process.env.COVERS_DIR ?? "/opt/onbrand/covers";
      buf = readFileSync(join(dir, url.slice(prefix.length + 1).replace(/[^\w.-]/g, "")));
    } else {
      const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!resp.ok) throw new Error(`Portrait download failed (${resp.status}).`);
      buf = Buffer.from(await resp.arrayBuffer());
    }
  }
  const sharp = (await import("sharp")).default;
  const jpeg = await sharp(buf).resize(512, 512, { fit: "cover", position: "attention" }).jpeg({ quality: 82 }).toBuffer();
  const key = await setRepPhoto(rep.id, `data:image/jpeg;base64,${jpeg.toString("base64")}`);
  return key!;
}

// ── brand-brain access (the QR on the profile page) ─────────────────────────

/**
 * LINE 官方帳號的 basic ID（@xxxx）。用現有的 channel token 問 LINE 就拿得到，
 * 不必多一個 secret。拿不到（沒設 token、LINE 掛了）就回 null，加入頁改成
 * 顯示綁定碼讓人手動輸入——入口不能因為一個查詢失敗就整個消失。
 */
let basicIdCache: { value: string | null; at: number } | null = null;
export async function lineBasicId(): Promise<string | null> {
  if (process.env.LINE_BOT_BASIC_ID) return process.env.LINE_BOT_BASIC_ID;
  if (basicIdCache && Date.now() - basicIdCache.at < 6 * 3600_000) return basicIdCache.value;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  let value: string | null = null;
  if (token) {
    try {
      const res = await fetch("https://api.line.me/v2/bot/info", {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) value = ((await res.json()) as any)?.basicId ?? null;
    } catch {
      value = null;
    }
  }
  basicIdCache = { value, at: Date.now() };
  return value;
}

/** 點了就打開 LINE 的聊天室，綁定碼已經打好在輸入框裡，業務只要按送出。 */
export const lineBindUrl = (basicId: string, code: string) =>
  // LINE 文件的寫法是 @ 不編碼（line.me/R/oaMessage/@xxxx/?text）。
  `https://line.me/R/oaMessage/${encodeURIComponent(basicId).replace(/^%40/, "@")}/?${encodeURIComponent(code)}`;

export const BIND_CODE_RE = /^[A-F0-9]{6}$/;

// ── demo seed ───────────────────────────────────────────────────────────────

/**
 * 示範業務的人設。key = avatar_seed。虛構的人、虛構的前公司，故事不帶數字。
 * 只在 profile 還是 NULL 時寫入，展場上手改過的不會被下一次部署蓋掉。
 */
export const DEMO_REP_PROFILES: Record<string, RepProfile> = {
  amy: {
    headline: "Helps Taipei retailers turn online orders into repeat customers",
    location: "Taipei, Taiwan", yearsExperience: 9, languages: ["Mandarin", "English", "Taiwanese"],
    bio: "Amy started on a department-store sales floor and moved into B2B software when she saw how many shop owners ran their business from spreadsheets. She now looks after retail and e-commerce accounts in northern Taiwan and is known for showing up with the owner's own sales report already annotated.",
    expertise: ["Retail POS and e-commerce", "Omnichannel inventory", "Owner-operated businesses"],
    experience: [
      { role: "Senior Account Manager", company: "ExpertHub", period: "2022 – now", highlight: "Leads the north-region retail portfolio and mentors two new account managers." },
      { role: "Account Manager", company: "Brightline Retail Systems", period: "2018 – 2022", highlight: "Moved a chain of bakeries from paper ordering to a shared online stock view." },
      { role: "Floor Supervisor", company: "Department store, Xinyi District", period: "2015 – 2018", highlight: "Learned retail from the cash register up." },
    ],
    education: "B.B.A., National Chengchi University",
    achievements: ["Top north-region account manager, two consecutive years", "Runs the team's monthly retail-owner coffee meetup"],
    stories: [
      "A tea-shop owner told her she closed the books at midnight every night; after moving to a cloud POS she now closes before dinner.",
      "A family-run stationery chain wanted one view of stock across three stores and its online shop; she walked them through a diagnosis before recommending anything.",
    ],
    voice: { tone: "Warm, practical, a little playful — talks like a friend who happens to know software", traits: ["Opens with a scene from a real shop visit", "Short paragraphs", "Ends with a question to the reader"], signoff: "— Amy 🙂" },
    avoid: ["Jargon like 'synergy'", "Pressure to decide quickly"],
  },
  kevin: {
    headline: "Food & beverage specialist who has worked a restaurant rush himself",
    location: "Taipei, Taiwan", yearsExperience: 5, languages: ["Mandarin", "English"],
    bio: "Kevin worked shifts in his family's noodle shop before joining ExpertHub, so he speaks kitchen. He helps restaurants and cafés pick ordering, booking and staffing tools that survive a Friday-night rush.",
    expertise: ["Restaurant ordering and booking", "Staff scheduling", "Food & beverage chains"],
    experience: [
      { role: "Account Manager", company: "ExpertHub", period: "2023 – now", highlight: "Covers F&B and lifestyle-service accounts in Taipei." },
      { role: "Inside Sales Representative", company: "TableTap", period: "2021 – 2023", highlight: "First point of contact for independent restaurants." },
    ],
    education: "B.A. Hospitality Management, Ming Chuan University",
    achievements: ["Fastest ramp-up in his intake class"],
    stories: [
      "A ramen shop owner said the busiest hour was spent answering the phone instead of cooking; online booking gave that hour back to the kitchen.",
      "He still visits clients during the lunch rush to see where the bottleneck really is.",
    ],
    voice: { tone: "Energetic and direct, like a chat at the counter", traits: ["Uses food metaphors", "One clear takeaway per post"], signoff: "Kevin" },
    avoid: ["Overpromising speed"],
  },
  tina: {
    headline: "Builds partnerships between Taiwan's software makers and the businesses that need them",
    location: "Taipei, Taiwan", yearsExperience: 12, languages: ["Mandarin", "English", "Japanese"],
    bio: "Tina manages ExpertHub's channel partners — the local software companies whose solutions sit in the catalog. She is the person who knows which partner actually answers the phone after go-live.",
    expertise: ["Channel and ISV partnerships", "Partner enablement", "Cross-industry solution matching"],
    experience: [
      { role: "Channel Partner Manager", company: "ExpertHub", period: "2020 – now", highlight: "Grew the curated partner bench and set the partner onboarding standard." },
      { role: "Alliance Manager", company: "Formosa Cloud Services", period: "2014 – 2020", highlight: "Ran co-selling programs with regional resellers." },
    ],
    education: "M.B.A., National Taiwan University",
    achievements: ["Designed the partner quality checklist used in every listing review"],
    stories: [
      "A partner's support team stayed on a call with a client past midnight to finish a migration — she uses that as the bar for every new partner.",
    ],
    voice: { tone: "Measured and credible, an industry insider sharing what she has seen", traits: ["Names the partner and gives them credit", "Explains how she evaluates"], signoff: "Tina Wang | Channel Partnerships" },
    avoid: ["Ranking partners against each other"],
  },
  jay: {
    headline: "Speaks factory-floor — helps central Taiwan manufacturers digitise one line at a time",
    location: "Taichung, Taiwan", yearsExperience: 7, languages: ["Mandarin", "Taiwanese"],
    bio: "Jay grew up around his uncle's machining shop in Taichung. He works with small and mid-sized manufacturers who want to digitise without stopping production.",
    expertise: ["Small-factory digitisation", "Production scheduling", "ERP for SMEs"],
    experience: [
      { role: "Account Manager", company: "ExpertHub", period: "2022 – now", highlight: "Owns manufacturing accounts in the central region." },
      { role: "Sales Engineer", company: "Precision Tools Co.", period: "2018 – 2022", highlight: "Supported CNC equipment customers on site." },
    ],
    education: "B.S. Mechanical Engineering, Feng Chia University",
    achievements: ["Certified in lean manufacturing basics"],
    stories: ["A machining shop moved its job tickets from a whiteboard to a shared schedule, and the night shift stopped calling the owner to ask what to run next."],
    voice: { tone: "Plain-spoken and grounded", traits: ["Talks about one machine or one line, never the whole factory", "Uses Taiwanese phrases sparingly"], signoff: "Jay" },
    avoid: ["Industry 4.0 buzzwords"],
  },
  grace: {
    headline: "Solutions consultant who diagnoses before she recommends",
    location: "Taichung, Taiwan", yearsExperience: 8, languages: ["Mandarin", "English"],
    bio: "Grace runs the free online diagnosis sessions for central-region customers and turns what she hears into a short, honest shortlist.",
    expertise: ["Business process diagnosis", "Manufacturing and e-commerce", "Solution scoping"],
    experience: [
      { role: "Solutions Consultant", company: "ExpertHub", period: "2021 – now", highlight: "Leads diagnosis sessions and solution scoping." },
      { role: "Business Analyst", company: "Midland ERP Partners", period: "2017 – 2021", highlight: "Mapped processes for mid-sized manufacturers." },
    ],
    education: "M.S. Information Management, National Chung Hsing University",
    achievements: ["Wrote the internal diagnosis question bank"],
    stories: ["A client came in asking for a new ERP; the diagnosis showed the real gap was order intake, which a much smaller tool solved."],
    voice: { tone: "Analytical but kind, explains the why", traits: ["Structures posts as problem → what we found → what helped", "Uses numbered lists"], signoff: "Grace Huang · Solutions Consulting" },
    avoid: ["Recommending before diagnosing"],
  },
  leo: {
    headline: "Southern Taiwan's go-to for food processors and family manufacturers",
    location: "Kaohsiung, Taiwan", yearsExperience: 4, languages: ["Mandarin", "Taiwanese"],
    bio: "Leo covers Kaohsiung and Tainan, where many of his clients are second-generation owners taking over a family plant.",
    expertise: ["Food processing", "Family-business succession", "Traceability"],
    experience: [{ role: "Account Manager", company: "ExpertHub", period: "2023 – now", highlight: "Opened the southern food-processing segment." }],
    education: "B.B.A., National Sun Yat-sen University",
    achievements: [],
    stories: ["A second-generation owner wanted to prove product traceability to a new retail buyer; they started with batch records before anything else."],
    voice: { tone: "Friendly and humble", traits: ["Mentions the owner's family story", "Keeps it short"], signoff: "Leo" },
    avoid: [],
  },
  joyce: {
    headline: "Long-term partner to southern Taiwan manufacturers — still in touch with her first client",
    location: "Tainan, Taiwan", yearsExperience: 11, languages: ["Mandarin", "English", "Taiwanese"],
    bio: "Joyce believes the sale starts after go-live. Many of her accounts have been with her through three or four projects.",
    expertise: ["Manufacturing operations", "Account growth", "Post-implementation support"],
    experience: [
      { role: "Senior Account Manager", company: "ExpertHub", period: "2019 – now", highlight: "Highest account retention in the south region." },
      { role: "Key Account Manager", company: "Southern Industrial Supply", period: "2014 – 2019", highlight: "Managed long-term supply relationships." },
    ],
    education: "B.A. International Business, National Cheng Kung University",
    achievements: ["South-region retention award"],
    stories: ["Her first client from years ago still calls her before every new software decision — not to buy, just to think out loud."],
    voice: { tone: "Reflective and steady, a trusted advisor", traits: ["Shares lessons learned", "Thanks clients by first name when they agree"], signoff: "Joyce Liu" },
    avoid: ["Limited-time pressure"],
  },
  hank: {
    headline: "Channel partner manager for the south — new to the team",
    location: "Kaohsiung, Taiwan", yearsExperience: 3, languages: ["Mandarin"],
    bio: "", expertise: ["Reseller relationships"], experience: [], education: "", achievements: [], stories: [],
    voice: { tone: "", traits: [], signoff: "" }, avoid: [],
  },
  jordan: {
    headline: "Connects U.S. resellers with proven Taiwan software partners",
    location: "Dallas, TX", yearsExperience: 10, languages: ["English", "Spanish"],
    bio: "Jordan builds ExpertHub's North American partner network — MSPs and resellers who want curated software their small-business customers will actually adopt.",
    expertise: ["Reseller and MSP partnerships", "Cross-border go-to-market", "Partner programs"],
    experience: [
      { role: "Partner Development Manager", company: "ExpertHub", period: "2024 – now", highlight: "Launched the North America partner program." },
      { role: "Channel Account Manager", company: "Lone Star IT Distribution", period: "2017 – 2024", highlight: "Managed a portfolio of regional MSPs across Texas and Oklahoma." },
    ],
    education: "B.B.A. Marketing, University of North Texas",
    achievements: ["Built the program's first partner playbook"],
    stories: ["An MSP owner told him they were tired of reselling tools their clients abandoned after a month; diagnosis-first matching was the reason they signed."],
    voice: { tone: "Confident, partner-first, straight talk", traits: ["Leads with a partner's problem", "Uses 'we' for the partnership"], signoff: "— Jordan" },
    avoid: ["Disrupt", "Calling partners 'vendors'"],
  },
  priya: {
    headline: "Helps U.S. small businesses pick AI tools they will actually use",
    location: "Austin, TX", yearsExperience: 8, languages: ["English", "Hindi"],
    bio: "Priya leads solution sales for North America. A former customer-success manager, she judges every tool by whether the customer is still using it ninety days later.",
    expertise: ["AI for small business", "Customer success", "Solution selling"],
    experience: [
      { role: "Solutions Sales Lead", company: "ExpertHub", period: "2024 – now", highlight: "Leads solution sales for the U.S. market." },
      { role: "Customer Success Manager", company: "Brightdesk", period: "2019 – 2024", highlight: "Owned onboarding and renewals for small-business accounts." },
      { role: "Operations Analyst", company: "Regional logistics firm", period: "2016 – 2019", highlight: "Automated weekly reporting." },
    ],
    education: "M.S. Information Systems, The University of Texas at Austin",
    achievements: ["Speaker at a regional small-business technology meetup", "Customer-success mindset award"],
    stories: [
      "A bakery owner asked her which AI tool to start with; she suggested starting with the one task the owner hated most — answering the same customer questions every day.",
      "She asks every new client what software they stopped using last year, and why.",
    ],
    voice: { tone: "Curious, upbeat and evidence-minded", traits: ["Opens with a question", "Gives one practical first step", "Uses short lists"], signoff: "Priya ✨" },
    avoid: ["Hype about AI replacing people", "Game-changer"],
  },
  marcus: {
    headline: "Account executive for main-street retail and restaurants",
    location: "Fort Worth, TX", yearsExperience: 6, languages: ["English"],
    bio: "Marcus works with independent shops and restaurants across the Dallas–Fort Worth area and visits most of them in person.",
    expertise: ["Retail and restaurants", "Local small business"],
    experience: [
      { role: "Account Executive", company: "ExpertHub", period: "2025 – now", highlight: "Covers SMB retail and food & beverage in DFW." },
      { role: "Account Executive", company: "Main Street Payments", period: "2020 – 2025", highlight: "Signed and supported local merchants." },
    ],
    education: "B.S. Business, Texas Christian University",
    achievements: [],
    stories: ["A taco shop owner said he only trusts software his neighbor already uses — so Marcus now introduces owners to each other."],
    voice: { tone: "Neighborly and down-to-earth", traits: ["Mentions the neighborhood", "No acronyms"], signoff: "Marcus" },
    avoid: [],
  },
};
