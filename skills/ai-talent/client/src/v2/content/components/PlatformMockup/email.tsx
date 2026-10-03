/**
 * Email / EDM mockups.
 * Based on Figma: EDM-Template--Community- (MptQE79Z7i58WDLIvGMOmU)
 *
 * Variants:
 *   edm      — full HTML email (header + hero + body + CTA + footer)
 *   newsletter — simpler single-column editorial
 */
import { Button, Chip, Divider, Skeleton } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faArrowRight, faAt, faInbox } from "@fortawesome/free-solid-svg-icons";
import { type MockupFields, MockupHeader, handleOf, MarkdownText } from "./shared";
import { useLang } from "../../../../lib/i18n";

/* ─────────────── EDM / Full Email ─────────────── */

export function EDMMockup({ title, brandName, variantLabel, liveCaption, liveTitle, liveCta, liveImageUrl, liveImageStatus }: MockupFields) {
  const { lang } = useLang();
  const brand = brandName ?? "Your Brand";
  const handle = handleOf(brandName);
  const hasHeroImg = !!liveImageUrl && liveImageStatus !== "failed";
  // 2026-05-18 (CJ 驗收 P0「主旨行全空白」): the launch-sequence prompt
  // now emits "主旨：…\n預覽：…\n\n<body>". Parse it so the EDM mockup
  // shows the real subject + preview text and a clean body.
  // 2026-07-20 (CJ QA「教學版：preheader 字樣裸露、下半段空白、整篇粗體」—
  // output 3314): the writer emitted ONE line with no newlines
  // (「主旨：X preheader：Y <body>」) — the line-anchored parsing then
  // swallowed everything into the bold subject slot and the body went
  // empty. Deterministically re-break single-line captions before parsing:
  // newline before the preview label, and end the preview value at the
  // first 。 (or ~48 chars) so the body starts on its own paragraph.
  let _cap = liveCaption ?? "";
  if (!/\n/.test(_cap) && /(?:主旨|Subject)\s*[：:]/i.test(_cap)) {
    _cap = _cap
      // newline before the preview label
      .replace(/\s*(?=(?:preheader|Preview|預覽(?:文字)?)\s*[：:])/i, "\n")
      // end the preview value at the first whitespace gap (single-line
      // outputs separate segments with spaces; CJK values have none inside)
      .replace(/((?:preheader|Preview|預覽(?:文字)?)\s*[：:]\s*[^\s\n]{4,60})[ \t]+/i, "$1\n\n")
      // fallback when the value has no space gap: cut at the first 。
      .replace(/((?:preheader|Preview|預覽(?:文字)?)\s*[：:]\s*[^。\n]{0,48}。)[ \t]*(?=\S)/i, "$1\n\n");
    // 主旨-only single line (no preview label): body starts after the
    // subject's first whitespace gap
    if (!/\n/.test(_cap)) {
      _cap = _cap.replace(/^([\s#*>\-]*(?:主旨|Subject)\s*[：:]\s*[^\s\n]{2,40})[ \t]+/i, "$1\n\n");
    }
  }
  const _grab = (kw: string) => {
    const m = _cap.match(new RegExp(`^[\\s#*>\\-]*${kw}\\s*[：:]\\s*(.+?)\\**\\s*$`, "mi"));
    return m?.[1]?.trim() || "";
  };
  // 2026-05-19 (CJ 驗收 v#2 Week-2 bug): _grab returns capture group after
  // "主旨：" so it should NOT include the prefix — but if the model emits the
  // header line in an unexpected format (e.g. no newline before it, or the
  // regex fails to match), liveTitle may fall through as-is. Add a safety
  // strip so "主旨：<text>" → "<text>" regardless of where it came from.
  // 2026-07-20 (CJ QA 截圖: 主旨列裸露「…preheader：膳食纖維…」): when the
  // model emits everything on one line and the pre-split misses, the
  // subject string can still carry a trailing "preheader：/預覽：/CTA：…"
  // fragment. A subject must never contain other metadata — cut at the
  // first such marker.
  const _stripMetaPrefix = (s: string) =>
    s
      .replace(/^[\s#*>\-]*(?:主旨|Subject)\s*[：:]\s*/i, "")
      .replace(/\s*(?:preheader|Preview|預覽(?:文字)?|CTA|行動呼籲)\s*[：:].*$/i, "")
      .trim();
  // 2026-07-20 (CJ「促銷信主旨看起來斷字/漏字」): when the caption has no
  // 主旨： line, the fallback subject is the body's first sentence hard-cut
  // at 32 chars — often mid-phrase（…數量有限——一…）which reads as broken
  // text. Trim a "…"-suffixed derived subject back to the last punctuation
  // boundary so it ends on a clean phrase. Real 主旨： lines are untouched.
  const _tidyDerivedSubject = (s: string): string => {
    if (!s.endsWith("…")) return s;
    const core = s.slice(0, -1);
    let last = -1;
    for (const ch of ["，", "、", "；", "：", "。", "—", "–", ",", ";", ":"]) {
      const i = core.lastIndexOf(ch);
      if (i > last) last = i;
    }
    if (last < 8) return s; // no useful boundary — keep the ellipsis version
    return core.slice(0, last).replace(/[，、；：。,;:\s—–-]+$/u, "");
  };
  const subject = _tidyDerivedSubject(
    _stripMetaPrefix((liveTitle || _grab("主旨") || _grab("Subject") || title || "").trim()),
  );
  // "preheader" added 2026-07-20 — the EDM craft rubric teaches the concept
  // by that English name, so models label the line accordingly.
  const previewText = _grab("預覽(?:文字)?") || _grab("Preview") || _grab("preheader");
  // 2026-05-19 v#2: loose fallback was picking up CTA occurrences INSIDE the
  // body text (e.g. embedded reminder "（CTA：設定我的品牌腳色）"), producing a
  // double CTA button when the strict header-line match also succeeded.
  // Fix: remove the loose fallback entirely — if the model didn't emit a
  // proper "CTA：" header line, fall through to liveCta (passed from parent)
  // rather than guessing from body text.
  const _grabCta = (): string => _grab("CTA") || _grab("行動呼籲");
  const parsedCta = _grabCta() || liveCta || "";
  // 2026-05-19 (CJ 驗收 P1「Guardrail 殘缺」): prompt-only guardrails keep
  // leaking 驚嘆號 + 煽動詞 on the heaviest letters (上線封 / 提醒2). Add a
  // deterministic mockup-side sanitizer as backstop — applied to BOTH body
  // and preview text. Replaces ALL ！/! (not just line-end), strips emoji /
  // hashtags, and soft-rewrites the top forbidden 煽動 phrases.
  const _sanitize = (s: string): string =>
    s
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️]/gu, "")
      .replace(/(^|\s)#[^\s#]+/g, "")
      // forbidden 煽動 / 效率 phrases → calmer SoWork tone
      .replace(/快來體驗/g, "歡迎了解")
      .replace(/快(?:點|來)?把握(?:這個)?機會/g, "把握這次機會")
      .replace(/快把握/g, "把握")
      .replace(/別再猶豫/g, "")
      .replace(/終於來了/g, "正式登場")
      .replace(/(^|[，。、\s])而且(?=[！!])/g, "$1")
      .replace(/立刻了解更多/g, "了解更多")
      .replace(/立即(?=了解|報名|註冊|體驗)/g, "")
      // collapse exclamation (mid-sentence too) → period
      .replace(/[!！]+/g, "。")
      // tidy up artefacts from the replacements above
      .replace(/。{2,}/g, "。")
      .replace(/(^|\n)\s*。\s*/g, "$1")
      .replace(/[ \t]{2,}/g, " ");
  const bodyText = _sanitize(
    _cap
      // Strip metadata header lines (g flag — model sometimes repeats them)
      .replace(/^[\s#*>\-]*主旨\s*[：:].*$/mg, "")
      .replace(/^[\s#*>\-]*Subject\s*[：:].*$/img, "")
      .replace(/^[\s#*>\-]*預覽(?:文字)?\s*[：:].*$/mg, "")
      .replace(/^[\s#*>\-]*Preview\s*[：:].*$/img, "")
      .replace(/^[\s#*>\-]*preheader\s*[：:].*$/img, "")
      .replace(/^[\s#*>\-]*(?:CTA|行動呼籲)\s*[：:].*$/mg, "")
      // Strip inline parenthesised CTA hints that slipped into body paragraphs
      // e.g. "（CTA：設定我的品牌腳色）" — greedy up to closing bracket or EOL
      .replace(/[（(](?:CTA|行動呼籲)\s*[：:]\s*[^）)]{1,30}[）)]?/gm, ""),
  )
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s+/, "")
    .trim();
  // preview text: same forbidden-phrase + emoji cleanup, plus drop any
  // CTA-leak that slipped into the preview line ("…立刻了解更多").
  const previewClean = _sanitize(previewText)
    .replace(/(?:CTA|行動呼籲)\s*[：:]\s*.{1,20}/g, "")
    .trim();

  return (
    <div className="w-full max-w-[600px] mx-auto">
      <MockupHeader icon={faEnvelope} label="EDM" variantLabel={variantLabel} />

      {/* Email client chrome */}
      <div className="bg-default-100 rounded-t-xl border border-divider px-4 py-2.5 flex items-center gap-3">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-danger-300" />
          <span className="w-3 h-3 rounded-full bg-warning-300" />
          <span className="w-3 h-3 rounded-full bg-success-300" />
        </div>
        <div className="flex-1 bg-content1 rounded-md px-3 py-1 text-tiny text-default-400 flex items-center gap-2">
          <FontAwesomeIcon icon={faInbox} className="text-tiny" />
          {subject ? subject.slice(0, 60) : (lang === "en" ? "Subject line · waiting for AI to fill in" : "主旨行 · 等待 AI 撰寫 填入")}
        </div>
      </div>

      {/* Email body */}
      <div className="bg-content1 border-x border-b border-divider rounded-b-xl overflow-hidden shadow-lg">

        {/* Email meta bar */}
        <div className="px-5 py-3 border-b border-divider flex items-center gap-2 text-tiny text-default-500">
          <FontAwesomeIcon icon={faAt} />
          <span>{lang === "en" ? "From:" : "來自："}<strong>{brand}</strong> &lt;hello@{handle}.com&gt;</span>
          <span className="ml-auto">{lang === "en" ? "Just now" : "剛剛"}</span>
        </div>

        {/* Header banner */}
        <div className="bg-default-900 px-6 py-5 flex items-center justify-between">
          <p className="text-white font-bold text-[15px] tracking-tight">{brand}</p>
          <div className="flex items-center gap-3 text-default-400 text-tiny">
            <span className="hover:text-white cursor-pointer">{lang === "en" ? "Products" : "產品"}</span>
            <span className="hover:text-white cursor-pointer">{lang === "en" ? "About us" : "關於我們"}</span>
            <span className="hover:text-white cursor-pointer">{lang === "en" ? "Contact" : "聯絡"}</span>
          </div>
        </div>

        {/* Hero image — 2026-05-17 (CJ「圖片產出後放進 mockup 對應
            欄位；不需要圖片的任務不要顯示圖片欄」): email tasks never
            auto-generate a hero (runImageGen=false); it only exists if
            the user generated one via 改配圖. So render the hero ONLY
            when an actual image exists — no misleading「等待 AI 圖像」
            placeholder for text-only email tasks. */}
        {hasHeroImg && (
          <div className="aspect-[600/280] relative overflow-hidden">
            <img src={liveImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          </div>
        )}

        {/* Body section — text left, image right */}
        <div className="px-8 py-8">
          <h1 className="text-[22px] font-bold leading-snug tracking-tight text-foreground mb-1">
            {subject || <Skeleton className="h-6 w-[70%] rounded" />}
          </h1>
          {previewClean && (
            <p className="text-tiny text-default-400 mb-3 italic">{previewClean}</p>
          )}
          {bodyText ? (
            <MarkdownText content={bodyText} className="text-small text-default-600 leading-relaxed" />
          ) : (
            <div className="space-y-2 mt-2">
              <Skeleton className="h-3 w-full rounded" />
              <Skeleton className="h-3 w-[94%] rounded" />
              <Skeleton className="h-3 w-[88%] rounded" />
              <Skeleton className="h-3 w-[72%] rounded" />
            </div>
          )}

          {/* CTA button */}
          <div className="mt-6">
            <Button
              size="md" radius="md"
              className="bg-foreground text-background font-semibold px-8"
              endContent={<FontAwesomeIcon icon={faArrowRight} />}
            >
              {parsedCta || (lang === "en" ? "Learn more" : "立即了解")}
            </Button>
          </div>
        </div>

        {/* 2026-05-17 (CJ): removed the two decorative feature-image
            blocks — they had no data source and rendered as permanent
            empty skeletons, cluttering every EDM preview. */}

        <Divider />

        {/* Footer */}
        <div className="bg-default-50 px-8 py-5 text-center space-y-2">
          <p className="text-tiny text-default-500 font-semibold">{brand}</p>
          <p className="text-tiny text-default-400">
            {lang === "en" ? <>You received this email because you subscribed to the {brand} newsletter.</> : <>你收到這封信是因為訂閱了 {brand} 的電子報。</>}
          </p>
          <div className="flex items-center justify-center gap-3 text-tiny text-primary mt-2">
            <span className="cursor-pointer hover:underline">{lang === "en" ? "Unsubscribe" : "取消訂閱"}</span>
            <span className="text-default-300">·</span>
            <span className="cursor-pointer hover:underline">{lang === "en" ? "Privacy Policy" : "隱私政策"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── KOL / 1:1 Outreach Email ───────────────
 *
 * 2026-05-16 (CJ「KOL類別…我想要用的是email的mockup，就是有收件人，
 * 寄件人，有主旨標題，而內文也應該更文情並茂」):
 * A personal outreach letter — NOT a marketing EDM. No hero image,
 * no feature grid, no unsubscribe footer. Clean 寄件人 / 收件人 / 主旨
 * header + a generously-spaced letter body so the copy reads as a
 * heartfelt 1:1 invitation.
 */
export function KOLEmailMockup({
  title, brandName, variantLabel, liveCaption, liveTitle, slotMap,
}: MockupFields) {
  const { lang } = useLang();
  const brand = brandName ?? (lang === "en" ? "Your Brand" : "你的品牌");
  const handle = handleOf(brandName);
  const slotCap = slotMap?.caption;
  const captionLoading = slotCap?.status === "loading";
  const body =
    (typeof slotCap?.value === "string" ? slotCap.value : undefined) ??
    liveCaption ??
    "";
  const subject = (liveTitle ?? title ?? "").trim();

  return (
    <div className="w-full max-w-[600px] mx-auto">
      <MockupHeader icon={faEnvelope} label="Email" variantLabel={variantLabel} />

      {/* Email client chrome */}
      <div className="bg-default-100 rounded-t-xl border border-divider px-4 py-2.5 flex items-center gap-3">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-danger-300" />
          <span className="w-3 h-3 rounded-full bg-warning-300" />
          <span className="w-3 h-3 rounded-full bg-success-300" />
        </div>
        <div className="flex-1 bg-content1 rounded-md px-3 py-1 text-tiny text-default-400 flex items-center gap-2">
          <FontAwesomeIcon icon={faInbox} className="text-tiny" />
          {subject ? subject.slice(0, 60) : (lang === "en" ? "Subject · waiting for AI" : "主旨 · 等待 AI 撰寫")}
        </div>
      </div>

      <div className="bg-content1 border-x border-b border-divider rounded-b-xl overflow-hidden shadow-lg">
        {/* Header meta — 寄件人 / 收件人 / 主旨 */}
        <div className="px-6 py-4 border-b border-divider space-y-1.5 text-small">
          <div className="flex gap-2">
            <span className="text-default-400 w-12 shrink-0">{lang === "en" ? "From" : "寄件人"}</span>
            <span className="text-foreground">
              <strong>{brand}</strong>
              <span className="text-default-400"> &lt;hello@{handle}.com&gt;</span>
            </span>
          </div>
          <div className="flex gap-2">
            <span className="text-default-400 w-12 shrink-0">{lang === "en" ? "To" : "收件人"}</span>
            <span className="text-foreground">{lang === "en" ? "Partner KOL / creator" : "合作 KOL／創作者"} &lt;creator@example.com&gt;</span>
          </div>
          <div className="flex gap-2">
            <span className="text-default-400 w-12 shrink-0">{lang === "en" ? "Subject" : "主旨"}</span>
            <span className="text-foreground font-semibold">
              {subject || <span className="text-default-300 font-normal">{lang === "en" ? "(waiting for AI to write the subject)" : "（等待 AI 撰寫主旨）"}</span>}
            </span>
          </div>
        </div>

        {/* Letter body */}
        <div className="px-8 py-7">
          {body.trim() ? (
            <MarkdownText
              content={body}
              className="text-[15px] text-default-700 leading-loose whitespace-pre-wrap"
            />
          ) : captionLoading ? (
            <div className="space-y-2.5">
              {[100, 96, 90, 100, 84, 70].map((w, i) => (
                <Skeleton key={i} className="h-3 rounded" style={{ width: `${w}%` }} />
              ))}
              <div className="flex items-center gap-1 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse inline-block" />
                <span className="text-[10px] text-primary/70">{lang === "en" ? "Agent is writing…" : "Agent 撰寫中…"}</span>
              </div>
            </div>
          ) : (
            <p className="text-small text-default-400">{lang === "en" ? "No content yet" : "尚無內容"}</p>
          )}

          {body.trim() && (
            <p className="mt-7 text-small text-default-500">
              {lang === "en" ? <>Looking forward to your reply,<br />
              <strong className="text-foreground">{brand}</strong></> : <>誠摯期待你的回覆，<br />
              <strong className="text-foreground">{brand}</strong> 敬上</>}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Email Newsletter (simpler) ─────────────── */

export function EmailNewsletterMockup({ title, brandName, variantLabel, liveCaption, liveTitle }: MockupFields) {
  const { lang } = useLang();
  const brand = brandName ?? "Your Brand";
  return (
    <div className="w-full max-w-[560px] mx-auto">
      <MockupHeader icon={faEnvelope} label={lang === "en" ? "Newsletter" : "電子報"} variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="px-6 py-4 border-b border-divider flex items-center justify-between">
          <Chip size="sm" variant="flat" color="secondary"
            startContent={<FontAwesomeIcon icon={faEnvelope} className="ml-1 text-tiny" />}>
            {lang === "en" ? "Newsletter issue" : "電子報 Issue"}
          </Chip>
          <span className="text-tiny text-default-400">{brand}</span>
        </div>
        <div className="px-8 py-8 space-y-4">
          <p className="text-tiny text-default-400 uppercase tracking-widest font-semibold">{lang === "en" ? "In this issue" : "本期重點"}</p>
          <h2 className="text-2xl font-bold leading-snug">{liveTitle ?? title}</h2>
          {liveCaption ? (
            <MarkdownText content={liveCaption} className="text-small text-default-600 leading-relaxed" />
          ) : (
            <div className="space-y-2">
              {[100, 95, 88, 70].map((w, i) => (
                <Skeleton key={i} className={`h-3 w-[${w}%] rounded`} />
              ))}
            </div>
          )}
          <Button size="sm" radius="md" color="primary" variant="flat"
            endContent={<FontAwesomeIcon icon={faArrowRight} />}>
            {lang === "en" ? "Read more" : "閱讀全文"}
          </Button>
        </div>
        <div className="px-8 py-4 border-t border-divider bg-default-50 text-center">
          <p className="text-tiny text-default-400">{brand} · {lang === "en" ? "Unsubscribe" : "取消訂閱"}</p>
        </div>
      </div>
    </div>
  );
}
