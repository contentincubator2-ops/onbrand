/**
 * miaNudgeCatalog.ts — single source of truth for Mia contextual nudges.
 *
 * Every contextual prompt Mia says ("剛排好的七天還能編輯…", "FB 文案完成了…")
 * lives here as a typed entry with stable ID, bilingual message, optional
 * action buttons, and dedupe policy. Pages don't write nudge text — they
 * just call fireNudge("nudge.id", vars) when something happens.
 *
 * 2026-06-12 (CJ「Mia 細緻化 + 不要自動跳出」):
 *   - Before: each page hand-wrote a message string in dispatchEvent("mia:nudge").
 *   - After: pages reference catalog entries by ID. Messages are bilingual,
 *     dedupe rules per-session, action buttons typed, and the whole
 *     customer-success script is reviewable in one file.
 *   - Nudges no longer auto-open Mia drawer — they accumulate as unread
 *     badge on the avatar. User clicks → drawer drains the queue.
 *
 * To add a new nudge:
 *   1. Add an entry to NUDGE_CATALOG (give it a stable ID like
 *      "feature.event_name").
 *   2. From the page where the event happens, call
 *      fireNudge("feature.event_name", { optional vars }).
 *   3. Done. No other code changes.
 */

import { CATALOG } from "../../lib/catalogFigures";
import type { MiaAction } from "../SupportDrawer.types";

// ── Type surface ─────────────────────────────────────────────────────────

export type NudgeMessage = {
  "zh-TW": string;
  en: string;
};

export interface NudgeDefinition {
  /** Stable kebab-dotted ID. Don't rename — used for dedupe + analytics. */
  id: string;
  /**
   * Resolution kind. Default "static" (uses `message` verbatim).
   * "llm" calls support.contextNudge.generate with `promptTemplate` +
   * context vars; the resolved string replaces the placeholder. `message`
   * acts as the fallback when LLM call fails.
   */
  kind?: "static" | "llm";
  /** Bilingual message shown as Mia's chat bubble. Supports {var} tokens.
   *  For kind="llm", this is the fallback shown if backend resolution fails. */
  message: NudgeMessage;
  /** For kind="llm": the bilingual prompt template sent to the backend.
   *  Same {var} interpolation as message — but the result is the LLM input. */
  promptTemplate?: NudgeMessage;
  /** Optional buttons rendered under the message. Drawer wires them up. */
  actions?: MiaAction[];
  /** If true (default), only fires once per session. Set false for
   *  always-show nudges (e.g. "task complete" that fires after every run). */
  dedupePerSession?: boolean;
}

// ── The catalog ──────────────────────────────────────────────────────────

export const NUDGE_CATALOG = {

  // ─── Platform tasks (FB / IG / YT / TikTok / Email / PR) ─────────────

  "task.fb.first_run_done": {
    id: "task.fb.first_run_done",
    message: {
      "zh-TW":
        "FB 廣告文寫好了！想做 A/B Test？「內容套組」任務可以一鍵生成 3 種變體" +
        "（同一個 USP、不同切入角度）。要是想搭配主視覺，按右上「生成主視覺」就會用同一份品牌大腦配圖。",
      en:
        "Your FB ad copy is ready. Want to A/B test? A content-pack task " +
        "tier — you'll get 3 variants (same USP, different angles). Need an " +
        "image? The 'Generate Visual' button uses the same Brand Brain.",
    },
    actions: [
      { kind: "open_task", tier: "60s", topic: "fb-variants", label: "做 3 個變體 →" },
    ],
  },

  "task.ig.first_run_done": {
    id: "task.ig.first_run_done",
    message: {
      "zh-TW":
        "IG Reels 腳本好了。下一步可以配主視覺或縮圖——按右上「生成主視覺」" +
        "用同一份品牌大腦做圖。想做完整貼文套組（單圖 + 輪播 + Reels），改跑「內容套組」任務。",
      en:
        "IG Reels script ready. Next: generate matching cover or visuals via " +
        "the top-right button (uses your Brand Brain). For a full set " +
        "(single image + carousel + Reels), run a content-pack task.",
    },
    actions: [
      { kind: "open_task", tier: "60s", topic: "ig-pack", label: "做完整套組 →" },
    ],
  },

  "task.yt.first_run_done": {
    id: "task.yt.first_run_done",
    message: {
      "zh-TW":
        "YouTube 腳本寫好了。前 15 秒鉤子是 retention 關鍵——如果第一版不夠強，" +
        "右上「重生開頭」可以單獨重寫前段，不會打掉重練全部。",
      en:
        "YouTube script ready. The first 15 seconds drive retention — if the " +
        "opening hook feels weak, hit 'Regenerate Opening' (top-right) to " +
        "rewrite just the intro, not the whole script.",
    },
  },

  "task.tiktok.first_run_done": {
    id: "task.tiktok.first_run_done",
    message: {
      "zh-TW":
        "TikTok 腳本好了！如果想做系列（埋伏筆 → 解謎 → 反轉的三集結構），" +
        "改跑「完整企劃」任務，會一次給你 3-5 集的弧線。",
      en:
        "TikTok script ready. Want a series (setup → reveal → twist across 3 " +
        "episodes)? Run a campaign task — you'll get the full arc.",
    },
    actions: [
      { kind: "open_task", tier: "99s", topic: "tiktok-series", label: "做系列 →" },
    ],
  },

  "task.email.first_run_done": {
    id: "task.email.first_run_done",
    message: {
      "zh-TW":
        "EDM 寫好了。主旨行是開信率關鍵——上方有 5 個替代主旨（用不同心理學原則）" +
        "可以挑或拿去 A/B test。如果這是歡迎信，可以接著做後續 onboarding 序列。",
      en:
        "Email draft ready. The subject line drives open rate — there are 5 " +
        "alternates above (different psychology angles) for A/B testing. If " +
        "this is a welcome email, you can chain it into an onboarding sequence.",
    },
    actions: [
      { kind: "open_task", tier: "60s", topic: "email-sequence", label: "做完整序列 →" },
    ],
  },

  "task.pr.first_run_done": {
    id: "task.pr.first_run_done",
    message: {
      "zh-TW":
        "PR 新聞稿寫好了。記者最重視的是「第一段 hook」——如果想試不同角度" +
        "（反共識 / 數據驅動 / 對抗框架），右上「換新聞鉤」會用不同框架重寫前段。",
      en:
        "Press release ready. Journalists weigh the first paragraph most — if " +
        "you want to try different angles (anti-consensus / data-driven / " +
        "antagonist framing), 'Swap News Hook' rewrites just the lead.",
    },
  },

  // ─── Brand Brain (14-step positioning) ────────────────────────────────

  "brand.positioning_step_5_done": {
    id: "brand.positioning_step_5_done",
    message: {
      "zh-TW":
        "走到一半了！剩下的 9 步會比前面更具體（聲音 Voice、禁用詞、品牌原型）。" +
        "完成後品牌大腦就鎖定，之後所有內容都會用這份產出。",
      en:
        "Halfway there! The next 9 steps get more concrete (Voice, banned " +
        "words, brand archetype). Once locked, every future post uses this " +
        "Brand Brain as the source of truth.",
    },
  },

  "brand.positioning_complete": {
    id: "brand.positioning_complete",
    message: {
      "zh-TW":
        "🔒 品牌大腦鎖定！現在最有效的下一步：到「靈感舞台」請幾位 agent 各想一個切角——" +
        "你會看到 AI 第一次真的「對得上你的品牌」。",
      en:
        "🔒 Brand Brain locked. Best next step: open the Idea stage and let a few " +
        "agents pitch angles — you'll see AI sound like your brand for " +
        "the first time.",
    },
    actions: [
      { kind: "navigate", url: "/inspiration", label: "去靈感舞台 →" },
    ],
  },

  // ─── Calendar / Publishing ────────────────────────────────────────────

  "calendar.first_post_scheduled": {
    id: "calendar.first_post_scheduled",
    message: {
      "zh-TW":
        "✅ 第一篇排定了。如果這個品牌還沒連 FB / IG，到「設定 → 帳號連結」" +
        "可以串 OAuth，到時直接從 OnBrand 發布、不用再切回平台後台。",
      en:
        "✅ Scheduled. If this brand hasn't connected FB / IG yet, head to " +
        "Settings → Connections to link OAuth — then you can publish directly " +
        "from OnBrand without switching tabs.",
    },
    actions: [
      { kind: "navigate", url: "/connections", label: "連結平台 →" },
    ],
  },

  // ─── Generic onboarding / discovery ───────────────────────────────────

  "onboarding.first_login": {
    id: "onboarding.first_login",
    message: {
      "zh-TW":
        "嗨，我是 Mia。我不會自動跳出來打擾你——但每當你完成一個動作（生成貼文、" +
        "鎖定品牌大腦、排七日…），我會在這個小頭像上留下未讀提示，告訴你接下來" +
        "最有用的一步是什麼。任何時候卡住，點我就好。",
      en:
        "Hi, I'm Mia. I won't auto-pop or interrupt — but each time you " +
        "complete a step (generate a post, lock the Brand Brain, plan a week…) " +
        "I'll leave a small unread indicator on this avatar with the most " +
        "useful next move. Stuck anytime? Just click me.",
    },
  },

  "connections.fb_connected": {
    id: "connections.fb_connected",
    message: {
      "zh-TW":
        "🎉 FB 連好了。試試到任意一篇 FB 貼文點「直接發布」——OnBrand 會把文字" +
        "（含主題標籤、行動呼籲）一次推到粉專。發布紀錄保留在「行事曆」可以追蹤。",
      en:
        "🎉 FB connected. Try any FB post → 'Publish directly' — OnBrand " +
        "pushes the copy (with hashtags + CTA) to your Page in one call. " +
        "History stays in the Calendar.",
    },
    actions: [
      { kind: "navigate", url: "/planner", label: "看本週企劃 →" },
    ],
  },

  // ─── Pricing / monetisation ───────────────────────────────────────────

  "pricing.idle_30s_explored": {
    id: "pricing.idle_30s_explored",
    message: {
      "zh-TW":
        "想清楚要選哪個方案？我可以幫你比對你的使用習慣 vs 三個方案——" +
        "直接告訴我「一週大概發幾篇、需要幾個平台」就好。",
      en:
        "Stuck choosing a plan? Tell me 'how many posts per week, how many " +
        "channels' and I'll match your usage to the best of the three tiers.",
    },
  },

  // ─── Error / blocker handling ─────────────────────────────────────────

  "task.generation_failed": {
    id: "task.generation_failed",
    message: {
      "zh-TW":
        "⚠️ 這次生成失敗了。最常見的兩個原因：(1) 品牌大腦還沒填完 → 補完會穩定很多，" +
        "(2) 主題太抽象 → 試著加一句具體場景（地點、時間、對象）。需要的話我幫你重跑。",
      en:
        "⚠️ Generation failed. Two common causes: (1) Brand Brain incomplete — " +
        "finishing it stabilizes output a lot. (2) Topic too abstract — try " +
        "adding a concrete scene (where / when / who). I can retry if you want.",
    },
    dedupePerSession: false, // re-fire on every failure
  },

  // ─── Content tiers (30s/60s/99s) — milestones ─────────────────────────

  "tier.60s_pack_done": {
    id: "tier.60s_pack_done",
    message: {
      "zh-TW":
        "📦 內容套組好了！這是 FB + IG + YT 三平台版本，每個都套同一個品牌大腦——" +
        "但語氣 / 長度 / 主題標籤是各平台優化過的。想看每個平台的差異對照，按右上「並排檢視」。",
      en:
        "📦 Content pack ready! Same Brand Brain applied to FB / IG / YT versions, " +
        "but tone / length / hashtags are platform-tuned. Hit 'Side-by-side' " +
        "(top-right) to compare across channels.",
    },
  },

  "tier.99s_campaign_done": {
    id: "tier.99s_campaign_done",
    message: {
      "zh-TW":
        "🎬 完整活動企劃出來了！這份包含 3-7 天的主敘事弧、跨平台分工、預期 KPI。" +
        "想直接排到日曆 + 開始發布，按底部「進入執行模式」。",
      en:
        "🎬 Full campaign generated! Includes a 3-7 day narrative arc, " +
        "cross-channel role split, and target KPIs. Hit 'Execution mode' at " +
        "the bottom to schedule and start publishing.",
    },
    actions: [
      { kind: "navigate", url: "/planner", label: "進入執行模式 →" },
    ],
  },

  // ─── Brand Brain — per-step gentle tips ───────────────────────────────

  "brand.step_1_done": {
    id: "brand.step_1_done",
    message: {
      "zh-TW":
        "Step 1 完成！「5 Whys」是最容易草草跳過的——但這一層挖到的「深層動機」" +
        "會影響後面 13 步全部。如果你填的還在表面，可以回去再想一次「為什麼是這個」。",
      en:
        "Step 1 done. The 5 Whys is the easiest one to rush — but the deep " +
        "motivation you find here shapes the next 13 steps. If your answer " +
        "feels surface-level, go back and ask 'why this?' once more.",
    },
  },

  "brand.step_7_done": {
    id: "brand.step_7_done",
    message: {
      "zh-TW":
        "TA 痛點分析完成。一個常被忽略的細節：再加 1-2 句「TA 內心 OS」" +
        "（他會在心裡跟自己說的話），AI 寫出來的文案會「真實感」翻倍。",
      en:
        "TA pain-point analysis done. One overlooked detail: add 1-2 lines of " +
        "'TA's inner monologue' (what they say to themselves). It doubles the " +
        "authenticity of generated copy.",
    },
  },

  "brand.step_11_done": {
    id: "brand.step_11_done",
    message: {
      "zh-TW":
        "品牌原型選好了。接下來「禁用詞」最關鍵——填入你絕對不會用的 5-10 個詞，" +
        "AI 從此會避開。例如「奢華」「頂級」「完美」這種空洞詞，列上來會立刻見效。",
      en:
        "Brand archetype locked. The banned-word list is the most powerful " +
        "next step — list 5-10 words you'd never use. Empty words like " +
        "'luxury', 'premium', 'perfect' work especially well.",
    },
  },

  // ─── Calendar / publishing — deeper paths ─────────────────────────────

  "calendar.week_scheduled": {
    id: "calendar.week_scheduled",
    message: {
      "zh-TW":
        "📅 整週排好了！想設定「自動發布」（時間到自動 push 到 FB）：日曆右上「自動發布」開關。" +
        "建議先選 1-2 篇試水溫，看了沒問題再全開。",
      en:
        "📅 Week scheduled! Toggle 'Auto-publish' (top-right of Calendar) to " +
        "push to FB automatically when each post's time arrives. " +
        "Recommendation: enable for 1-2 posts first, verify, then full week.",
    },
  },

  "publish.first_fb_success": {
    id: "publish.first_fb_success",
    message: {
      "zh-TW":
        "🎉 第一篇 FB 發布成功！48 小時後我會幫你拉觸及 / 互動數據——" +
        "如果某些 hook 表現特別好，下次自動套用同個結構。不用記筆記，OnBrand 會學。",
      en:
        "🎉 First FB post published! In 48 hours I'll pull reach + engagement " +
        "data — if certain hooks perform notably better, I'll auto-apply the " +
        "pattern next time. No need to take notes; OnBrand learns.",
    },
  },

  // ─── Team / collaboration ─────────────────────────────────────────────

  "team.first_invite_sent": {
    id: "team.first_invite_sent",
    message: {
      "zh-TW":
        "邀請寄出了。你的隊員加入後，會自動共用這個品牌大腦——他們寫的每篇也會 on-brand。" +
        "想設定誰能改 / 誰只能用？「設定 → 角色權限」。",
      en:
        "Invite sent. Once your teammate joins, they share this Brand Brain — " +
        "their posts stay on-brand too. To set who edits vs who consumes, " +
        "Settings → Roles & permissions.",
    },
  },

  // ─── Pricing / payment ────────────────────────────────────────────────

  "payment.upgrade_success": {
    id: "payment.upgrade_success",
    message: {
      "zh-TW":
        "🎊 方案升級完成！多解鎖的功能我幫你列一下：(1) 七日發布台無上限，(2) 完整企劃任務，" +
        "(3) FB 直接發布，(4) 多人協作。想看完整功能差異，「設定 → 方案 → 比較」。",
      en:
        "🎊 Plan upgraded! Newly unlocked: (1) Unlimited 7-Day Publisher, " +
        "(2) campaign tasks, (3) Direct FB publish, (4) Team collaboration. " +
        "See full diff: Settings → Plan → Compare.",
    },
  },

  "payment.trial_ending": {
    id: "payment.trial_ending",
    message: {
      "zh-TW":
        "你的試用還剩 3 天。如果還在猶豫——可以告訴我你最常用什麼功能，" +
        "我幫你算「正式付費後 vs 自己手寫 1 個月」會省多少時間 / 錢。",
      en:
        "3 days left on your trial. Still deciding? Tell me which feature " +
        "you use most — I'll calculate the time / money you'd save vs. " +
        "writing manually for a month.",
    },
  },

  // ─── RunPage contextual — fires from RunPage when output / image loads ──
  // These tell the user what they can do RIGHT NOW on the current screen,
  // not abstract next-step advice. Platform-specific so the message is
  // accurate about available sidebar actions.

  "run.ig.output_ready": {
    id: "run.ig.output_ready",
    dedupePerSession: false, // re-fire each new output
    message: {
      "zh-TW":
        "IG 貼文產好了 🎉 右側有兩個工具可以幫你細調：\n" +
        "① 點工具列的 💬 →「跟 AI 專家改文案」，直接告訴 AI 哪段不夠好、想換哪種語氣\n" +
        "② 點 🖼️ → 修改圖片提示詞，按「重新生圖」換一張\n" +
        "想換完全不同方向？上方「再給我 2 個」可以生新版本。",
      en:
        "IG post ready 🎉 Two tools on the right sidebar to fine-tune:\n" +
        "① Tap 💬 → 'Refine with AI Expert' — tell it which line feels off or what tone you want\n" +
        "② Tap 🖼️ → edit the image prompt, then hit Regenerate\n" +
        "Want a completely different take? 'Give me 2 more' at the top generates fresh variants.",
    },
  },

  "run.fb.output_ready": {
    id: "run.fb.output_ready",
    dedupePerSession: false,
    message: {
      "zh-TW":
        "FB 貼文好了！右側可以做的事：\n" +
        "① 💬「跟 AI 專家改文案」→ 調整 CTA 語氣、縮短段落、或讓 hook 更強\n" +
        "② 🖼️ → 換配圖提示詞重新生圖\n" +
        "想做 A/B 三版本？改跑「內容套組」任務。",
      en:
        "FB post ready! What you can do on the right:\n" +
        "① 💬 'Refine with AI Expert' → sharpen the CTA, shorten a paragraph, or punch up the hook\n" +
        "② 🖼️ → swap image prompt and regenerate\n" +
        "Want 3 A/B versions? Run a content-pack task.",
    },
  },

  "run.linkedin.output_ready": {
    id: "run.linkedin.output_ready",
    dedupePerSession: false,
    message: {
      "zh-TW":
        "LinkedIn 文章好了。右側工具提醒：\n" +
        "① 💬「跟 AI 專家改文案」→ 可以請 AI 讓開頭更抓眼、或加個數據佐證\n" +
        "② 🖼️ → 換橫幅圖片提示詞\n" +
        "LinkedIn 頭兩行是關鍵——如果展開前看不到鉤子，點擊率會掉很多。",
      en:
        "LinkedIn article ready. Sidebar tips:\n" +
        "① 💬 'Refine with AI Expert' → ask AI to strengthen the opening line or add a data point\n" +
        "② 🖼️ → swap the banner image prompt\n" +
        "The first two lines are critical — if the hook isn't visible before 'more', click-through drops.",
    },
  },

  "run.tiktok.output_ready": {
    id: "run.tiktok.output_ready",
    dedupePerSession: false,
    message: {
      "zh-TW":
        "TikTok 腳本好了！右側工具：\n" +
        "① 💬「跟 AI 專家改文案」→ 可以叫 AI 讓第一秒更爆、或加一個反轉\n" +
        "② 🖼️ → 換封面圖提示詞重新生\n" +
        "TikTok 前 1.5 秒決定留存率——開頭不夠鉤，其他寫得再好也沒用。",
      en:
        "TikTok script ready! Sidebar tools:\n" +
        "① 💬 'Refine with AI Expert' → make the first second more explosive, or add a twist\n" +
        "② 🖼️ → swap the cover image prompt\n" +
        "First 1.5 seconds determine retention — everything else is irrelevant if the hook doesn't land.",
    },
  },

  "run.yt.output_ready": {
    id: "run.yt.output_ready",
    dedupePerSession: false,
    message: {
      "zh-TW":
        "YouTube 腳本好了。右側工具：\n" +
        "① 💬「跟 AI 專家改文案」→ 讓 intro hook 更強、或重寫 CTA\n" +
        "② 🖼️ → 換縮圖提示詞重新生圖\n" +
        "前 15 秒 retention 是 YouTube 演算法最重視的指標——可以請 AI 專門重寫 intro。",
      en:
        "YouTube script ready. Sidebar tools:\n" +
        "① 💬 'Refine with AI Expert' → strengthen the intro hook or rewrite the CTA\n" +
        "② 🖼️ → swap the thumbnail prompt\n" +
        "First-15-second retention is YouTube's top signal — ask the AI to specifically rewrite the intro.",
    },
  },

  "run.email.output_ready": {
    id: "run.email.output_ready",
    dedupePerSession: false,
    message: {
      "zh-TW":
        "EDM 草稿好了。右側工具：\n" +
        "① 💬「跟 AI 專家改文案」→ 調整主旨行、強化 CTA、或縮短段落\n" +
        "② 🖼️ → 換 Header 圖提示詞\n" +
        "主旨行是開信率關鍵——可以叫 AI 幫你給 5 個替代版本，拿去 A/B test。",
      en:
        "Email draft ready. Sidebar tools:\n" +
        "① 💬 'Refine with AI Expert' → tweak the subject line, punch up the CTA, or trim a paragraph\n" +
        "② 🖼️ → swap the header image prompt\n" +
        "Subject line drives open rate — ask AI to give you 5 alternates for A/B testing.",
    },
  },

  "run.pr.output_ready": {
    id: "run.pr.output_ready",
    dedupePerSession: false,
    message: {
      "zh-TW":
        "PR 新聞稿好了。右側工具：\n" +
        "① 💬「跟 AI 專家改文案」→ 改新聞鉤角度、或強化數據引用\n" +
        "② 🖼️ → 換配圖提示詞\n" +
        "記者最看重第一段——如果想試不同框架（反共識 / 數據驅動 / 對抗框架），告訴 AI 專家。",
      en:
        "Press release ready. Sidebar tools:\n" +
        "① 💬 'Refine with AI Expert' → try a different news angle or sharpen a data citation\n" +
        "② 🖼️ → swap the image prompt\n" +
        "Journalists weigh the first paragraph most — tell the AI Expert if you want a different frame.",
    },
  },

  "run.output_ready": {
    id: "run.output_ready",
    dedupePerSession: false,
    message: {
      "zh-TW":
        "內容好了 🎉 右側工具可以幫你細調：\n" +
        "① 💬「跟 AI 專家改文案」→ 告訴 AI 哪段不夠好、想換哪種語氣\n" +
        "② 🖼️ → 修改圖片提示詞重新生圖",
      en:
        "Content ready 🎉 Use the right sidebar to fine-tune:\n" +
        "① 💬 'Refine with AI Expert' — tell it which line feels off or what tone you want\n" +
        "② 🖼️ → edit the image prompt and regenerate",
    },
  },

  "run.image_ready": {
    id: "run.image_ready",
    dedupePerSession: false,
    message: {
      "zh-TW":
        "🖼️ 圖片出來了。不滿意可以在右側「🖼️ 圖片設定」改提示詞重新生——" +
        "也可以切換 AI 模型（目前預設 gpt-image-2）試試不同風格。",
      en:
        "🖼️ Image generated. Not happy with it? Open 🖼️ Image Settings on the right, " +
        "edit the prompt, and hit Regenerate. You can also swap AI models (currently defaulting to gpt-image-2).",
    },
  },

  "run.brand_fix_applied": {
    id: "run.brand_fix_applied",
    dedupePerSession: false,
    message: {
      "zh-TW":
        "我注意到 AI 寫到了你品牌定位裡的禁用詞：{bannedWords}——已自動改寫。{subs}" +
        "如果不符合你想要的調性，要不要去調整一下品牌定位的語氣或禁用詞？",
      en:
        "I noticed AI used words on your brand's banned list: {bannedWords} — auto-corrected. {subs}" +
        "If this doesn't match your intended tone, want to adjust your brand voice or banned word list?",
    },
    actions: [
      { kind: "navigate", url: "/brand", label: "調整品牌定位 →" },
    ],
  },

  // ─── Media / asset generation ─────────────────────────────────────────

  "media.first_image_generated": {
    id: "media.first_image_generated",
    message: {
      "zh-TW":
        "🖼️ 主視覺好了。如果想試另一種風格（更扁平 / 更寫實 / 更編輯插畫感），" +
        "右上「換風格」會用同主題重新出 3 版讓你選。圖片風格也算品牌大腦的一部分，鎖定後會一致。",
      en:
        "🖼️ Visual ready. To try a different style (flatter / more " +
        "photorealistic / more editorial), 'Swap style' (top-right) regenerates " +
        "3 variants on the same theme. Image style is part of Brand Brain — " +
        "once locked, it stays consistent.",
    },
  },


  // ─── Discovery / learning loop ────────────────────────────────────────

  "discovery.first_award_case_viewed": {
    id: "discovery.first_award_case_viewed",
    message: {
      "zh-TW":
        "你剛看的這個得獎案例——你知道它的工藝其實已經內建在哪個任務嗎？我可以告訴你。" +
        `每一張爆款結構卡都說得出結構出處，這是 OnBrand 跟其他 AI 工具最大的差別。`,
      en:
        "That award case you just viewed — did you know its craft is already " +
        `encoded in one of our tasks? Ask me which one. Every one of our viral-structure cards ` +
        "state where their structure comes from — that's OnBrand's deepest difference.",
    },
  },

  // ─── Returning user / re-engagement ───────────────────────────────────

  "session.return_after_7_days": {
    id: "session.return_after_7_days",
    message: {
      "zh-TW":
        "👋 歡迎回來。你上次離開後我們新加了幾個東西：(1) 七日發布台支援 LINE，" +
        "(2) 完整企劃任務類別擴充，(3) 多模型可選 Claude 4.8 / GPT-5。要不要快速看一下？",
      en:
        "👋 Welcome back. Since you left: (1) 7-Day Publisher now supports " +
        "LINE, (2) more campaign task categories, (3) Claude 4.8 / GPT-5 model " +
        "options. Quick tour?",
    },
    actions: [
      { kind: "navigate", url: "/changelog", label: "看更新日誌 →" },
    ],
  },

  // ─── LLM-personalized (resolved by backend at fire time) ──────────────
  // These use the `kind: "llm"` resolution path. fireNudge sends contextVars
  // to support.contextNudge.generate; backend renders the promptTemplate
  // with the brand brain + provided context and returns the personalised
  // message. Static fallback shown if LLM fails / unavailable.

} as const satisfies Record<string, NudgeDefinition>;

// ── Public types ─────────────────────────────────────────────────────────

export type NudgeId = keyof typeof NUDGE_CATALOG;

/**
 * Interpolate {var} tokens in a message. e.g.
 *   interpolate("Hi {name}", { name: "Mia" }) → "Hi Mia"
 */
export function interpolate(
  template: string,
  vars: Record<string, string | number> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (_match, name) =>
    vars[name] != null ? String(vars[name]) : `{${name}}`,
  );
}
