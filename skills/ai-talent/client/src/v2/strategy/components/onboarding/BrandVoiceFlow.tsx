/**
 * BrandVoiceFlow — 丟參考文章，學成這個品牌自己的寫法。
 *
 * 2026-10-07（CJ「我要在流程中，增加這件事情」）。四步：
 *   1. 貼上以前發過的文章 → 系統自動分到五類（產品介紹／節慶活動／知識教育／品牌故事／互動閒聊），
 *      分錯可以拖曳改
 *   2. 等約一分鐘：每一類量出字數、語氣、結構、常用詞，反推成這個品牌的寫法
 *   3. 每一類一篇試寫（用品牌自己的產品當題目），左右對照原文
 *   4. 按「像」或「不像＋哪裡不像」，修到像為止；確認後每類變成一張品牌專屬任務卡，
 *      語氣寫進品牌大腦
 *
 * 這個元件只管流程本體，不含外框——建品牌精靈把它放在自己的視窗裡，
 * 「我的任務卡」把它放在另一個視窗裡。沒文章可丟的人按 onSkip 走原本的路。
 *
 * 每一類背後就是一張自建任務卡（server/content/core/catalog/brandVoice.ts），
 * 所以中途關掉再回來會接著上次的進度：有任何一類已經開始學，就直接進對照畫面。
 */
import React from "react";
import { Button, Select, SelectItem, Textarea } from "@heroui/react";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import {
  CheckIcon, ChevronLeftIcon, ChevronRightIcon, DoneIcon, RegenerateIcon, WarningIcon, WorkingIcon,
} from "../../../platform/components/icons";

type CategoryId = "product" | "festival" | "knowledge" | "story" | "chat";
type Bucket = CategoryId | "none";

/** 跟 server VOICE_CATEGORIES 同一組 id（跨邊界不 import；id 錯了 server 的 zod enum 會擋）。 */
const CATEGORIES: { id: CategoryId; zh: string; en: string; hintZh: string; hintEn: string }[] = [
  { id: "product",   zh: "產品介紹", en: "Product",          hintZh: "特色、用法、新品、開箱",       hintEn: "Features, how-to, launches" },
  { id: "festival",  zh: "節慶活動", en: "Festival & promo", hintZh: "檔期、優惠、抽獎、活動公告",   hintEn: "Seasonal, offers, giveaways" },
  { id: "knowledge", zh: "知識教育", en: "Education",        hintZh: "教學、觀念、懶人包、迷思破解", hintEn: "How-tos, explainers, myths" },
  { id: "story",     zh: "品牌故事", en: "Brand story",      hintZh: "理念、幕後、創辦緣起、顧客故事", hintEn: "Beliefs, behind the scenes" },
  { id: "chat",      zh: "互動閒聊", en: "Chat",             hintZh: "聊天、問答、日常、時事哏",     hintEn: "Small talk, polls, daily life" },
];

const CHANNELS: { id: string; zh: string; en: string }[] = [
  { id: "facebook",  zh: "Facebook",  en: "Facebook" },
  { id: "instagram", zh: "Instagram", en: "Instagram" },
  { id: "threads",   zh: "Threads",   en: "Threads" },
  { id: "line",      zh: "LINE",      en: "LINE" },
  { id: "email",     zh: "電子報",    en: "Newsletter" },
  { id: "website",   zh: "官網",      en: "Website" },
];

const MIN_PER_CATEGORY = 2;
const MAX_PER_CATEGORY = 10;
const MAX_ARTICLES = 40;
const MIN_ARTICLE_CHARS = 20;
const MAX_ARTICLE_CHARS = 8_000;

/** 跟 server splitArticles 同一套切法：單獨一行的 --- / === / ***，或連續三個以上空行。 */
function splitArticles(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t　]*(?:-{3,}|={3,}|\*{3,}|＊{3,}|—{3,}|_{3,})[ \t　]*\n|\n(?:[ \t　]*\n){3,}/)
    .map((s) => s.trim())
    .filter((s) => s.length >= MIN_ARTICLE_CHARS);
}

interface VoiceCardView {
  cardId: string;
  category: CategoryId;
  name: string;
  channel: string;
  published: boolean;
  phase: "learning" | "writing" | "review" | "revising" | "failed";
  error: string | null;
  currentStep: number;
  totalSteps: number;
  samples: string[];
  measured: { count: number; minChars: number; maxChars: number; medianChars: number };
  profile: { tone: string; structure: string; phrases: { text: string; count: number }[] } | null;
  topic: string;
  trial: string | null;
  trialInRange: boolean | null;
  verdict: "like" | "unlike" | null;
  rounds: number;
}

const isWorking = (c: VoiceCardView) => c.phase === "learning" || c.phase === "writing" || c.phase === "revising";

export default function BrandVoiceFlow({
  brandId, onDone, onSkip, waitFor,
}: {
  brandId: number;
  /** 完成（已上架、語氣已寫進品牌大腦）後按下「繼續」。 */
  onDone: () => void;
  /** 沒有文章可丟。給了才顯示跳過的按鈕。 */
  onSkip?: () => void;
  /**
   * 開始學之前要先等完的事（建品牌當下是「品牌大腦初版」）。試寫要讀品牌資料，
   * 太早開始會寫出一篇不認識這個品牌的東西。
   */
  waitFor?: Promise<unknown> | null;
}) {
  const { lang } = useLang();
  const en = lang === "en";
  const t = (zh: string, e: string) => (en ? e : zh);
  const catLabel = (id: CategoryId) => {
    const c = CATEGORIES.find((x) => x.id === id)!;
    return en ? c.en : c.zh;
  };

  const [stage, setStage] = React.useState<"paste" | "sort" | "learn" | "done">("paste");
  const [text, setText] = React.useState("");
  const [channel, setChannel] = React.useState("facebook");
  const [articles, setArticles] = React.useState<string[]>([]);
  const [buckets, setBuckets] = React.useState<Bucket[]>([]);
  const [classifyFailed, setClassifyFailed] = React.useState(false);
  const [dragging, setDragging] = React.useState<number | null>(null);
  const [overBucket, setOverBucket] = React.useState<Bucket | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState(false);
  const [selected, setSelected] = React.useState<CategoryId | null>(null);
  const [doneInfo, setDoneInfo] = React.useState<{ names: string[]; voiceWritten: boolean } | null>(null);

  const utils = trpc.useUtils() as any;
  const classifyMut = (trpc as any).brandVoice.classify.useMutation();
  const startMut = (trpc as any).brandVoice.start.useMutation();
  const feedbackMut = (trpc as any).brandVoice.feedback.useMutation();
  const retryMut = (trpc as any).brandVoice.retry.useMutation();
  const finishMut = (trpc as any).brandVoice.finish.useMutation();

  const [polling, setPolling] = React.useState(false);
  const statusQuery = (trpc as any).brandVoice.status.useQuery(
    { brandId },
    { refetchInterval: polling ? 3_000 : false, refetchOnWindowFocus: false },
  );
  const cards: VoiceCardView[] = (statusQuery.data ?? []) as VoiceCardView[];
  const anyWorking = cards.some(isWorking);
  React.useEffect(() => { setPolling(stage === "learn" && anyWorking); }, [stage, anyWorking]);

  // 上次學到一半（或已經學過）就直接接著看，不要求重貼。
  const resumed = React.useRef(false);
  React.useEffect(() => {
    if (resumed.current || !statusQuery.isSuccess) return;
    resumed.current = true;
    if (cards.length > 0) setStage("learn");
  }, [statusQuery.isSuccess, cards.length]);

  React.useEffect(() => {
    if (stage !== "learn" || cards.length === 0) return;
    if (!selected || !cards.some((c) => c.category === selected)) setSelected(cards[0]!.category);
  }, [stage, cards, selected]);

  const refresh = () => utils.brandVoice?.status?.invalidate?.({ brandId });

  // ── 1 貼文章 → 自動分類 ─────────────────────────────────────────────
  const detected = React.useMemo(() => splitArticles(text), [text]);
  const tooLong = detected.filter((a) => a.length > MAX_ARTICLE_CHARS).length;

  const goClassify = async () => {
    setError(null);
    const list = detected.filter((a) => a.length <= MAX_ARTICLE_CHARS).slice(0, MAX_ARTICLES);
    if (list.length < MIN_PER_CATEGORY) {
      setError(t(
        `至少要 ${MIN_PER_CATEGORY} 篇。每一篇之間用單獨一行的 --- 隔開。`,
        `Paste at least ${MIN_PER_CATEGORY} articles, separated by a line containing only ---.`,
      ));
      return;
    }
    try {
      const r = await classifyMut.mutateAsync({ brandId, articles: list });
      setArticles(list);
      setBuckets((r.assignments as (CategoryId | null)[]).map((a) => a ?? "none"));
      setClassifyFailed(!!r.failed);
      setStage("sort");
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  };

  // ── 2 確認分類 → 開始學 ─────────────────────────────────────────────
  const inBucket = (b: Bucket) => buckets.map((x, i) => (x === b ? i : -1)).filter((i) => i >= 0);
  const move = (i: number, b: Bucket) => setBuckets((prev) => prev.map((x, k) => (k === i ? b : x)));
  const readyCats = CATEGORIES.filter((c) => inBucket(c.id).length >= MIN_PER_CATEGORY);

  const goStart = async () => {
    setError(null);
    setStarting(true);
    try {
      // 品牌大腦初版還沒好就先等它——試寫要讀得到品牌資料。等不到也照樣開始。
      if (waitFor) await Promise.race([waitFor.catch(() => null), new Promise((r) => setTimeout(r, 90_000))]);
      await startMut.mutateAsync({
        brandId, channel,
        groups: readyCats.map((c) => ({
          category: c.id,
          samples: inBucket(c.id).slice(0, MAX_PER_CATEGORY).map((i) => articles[i]!),
        })),
      });
      setSelected(readyCats[0]!.id);
      await refresh();
      setStage("learn");
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setStarting(false);
    }
  };

  // ── 4 確認 ─────────────────────────────────────────────────────────
  const liked = cards.filter((c) => c.verdict === "like" && !isWorking(c));
  const goFinish = async () => {
    setError(null);
    try {
      const r = await finishMut.mutateAsync({ brandId });
      setDoneInfo({ names: (r.published as { category: CategoryId }[]).map((p) => catLabel(p.category)), voiceWritten: !!r.voiceWritten });
      utils.brandTaskCard?.list?.invalidate?.();
      utils.quickTask?.invalidate?.();
      setStage("done");
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  };

  const errorLine = error && (
    <p className="text-small text-danger flex items-start gap-1.5"><WarningIcon size={13} className="mt-1 shrink-0" /> {error}</p>
  );

  // ════════════════════════════════════════════════════════════════════
  if (stage === "paste") {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{t("把以前發過的文章貼上來", "Paste posts you've already published")}</h2>
          <p className="text-small text-default-600 mt-1 leading-relaxed">
            {t(
              "我們會照你真的寫過的東西，學出這個品牌自己的寫法——字數、語氣、結構、常用詞都從文章量出來。產品介紹、節慶活動、知識教育、品牌故事、互動閒聊，每類 2–5 篇最剛好；不用自己分類，貼上來就好。",
              "We learn this brand's own way of writing from what you've actually published — length, tone, structure and pet phrases are all measured from the posts. 2–5 per type works best (product, festival, education, brand story, chat). No need to sort them yourself.",
            )}
          </p>
        </div>

        <Textarea
          aria-label={t("參考文章", "Reference articles")}
          value={text}
          onValueChange={setText}
          minRows={9}
          maxRows={16}
          placeholder={t(
            "第一篇文章全文…\n---\n第二篇文章全文…\n---\n第三篇…\n\n（每一篇之間，用單獨一行的 --- 隔開）",
            "First post…\n---\nSecond post…\n---\nThird…\n\n(Separate posts with a line containing only ---)",
          )}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-small text-default-600">
            {t(`已讀到 ${detected.length} 篇`, `${detected.length} article(s) detected`)}
            {detected.length > MAX_ARTICLES && t(`（一次最多 ${MAX_ARTICLES} 篇，只取前面的）`, ` (max ${MAX_ARTICLES}; the rest are ignored)`)}
            {tooLong > 0 && t(`，其中 ${tooLong} 篇超過 ${MAX_ARTICLE_CHARS} 字不會使用`, `; ${tooLong} over ${MAX_ARTICLE_CHARS} characters will be skipped`)}
          </p>
          <Select
            size="sm"
            className="max-w-[220px]"
            label={t("這些文章主要發在", "Mostly published on")}
            selectedKeys={[channel]}
            onSelectionChange={(keys) => setChannel(String(Array.from(keys)[0] ?? "facebook"))}
          >
            {CHANNELS.map((c) => <SelectItem key={c.id}>{en ? c.en : c.zh}</SelectItem>)}
          </Select>
        </div>

        {errorLine}

        <div className="flex items-center justify-between gap-2 pt-1">
          {onSkip
            ? <Button variant="light" size="sm" onPress={onSkip}>{t("沒有文章，先跳過", "No articles — skip for now")}</Button>
            : <span aria-hidden />}
          <Button
            color="primary" style={{ background: "#171717" }} className="font-semibold"
            isLoading={classifyMut.isPending}
            isDisabled={detected.length < MIN_PER_CATEGORY}
            onPress={goClassify}
          >
            {t("下一步：自動分類", "Next: sort automatically")}
          </Button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  if (stage === "sort") {
    const zone = (b: Bucket, title: string, hint: string) => {
      const idxs = inBucket(b);
      const short = b !== "none" && idxs.length > 0 && idxs.length < MIN_PER_CATEGORY;
      return (
        <div
          key={b}
          onDragOver={(e) => { e.preventDefault(); setOverBucket(b); }}
          onDragLeave={() => setOverBucket((o) => (o === b ? null : o))}
          onDrop={(e) => { e.preventDefault(); if (dragging != null) move(dragging, b); setDragging(null); setOverBucket(null); }}
          className={`rounded-medium border p-2.5 min-h-[92px] transition ${
            overBucket === b ? "border-neutral-900 bg-default-100" : "border-divider"
          } ${b === "none" ? "border-dashed" : ""}`}
        >
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <p className="text-small font-semibold">
              {title} <span className="text-default-500 font-normal">{idxs.length}</span>
            </p>
            <p className={`text-tiny ${short ? "text-warning-600" : "text-default-500"}`}>
              {short ? t(`再 ${MIN_PER_CATEGORY - idxs.length} 篇才會學`, `${MIN_PER_CATEGORY - idxs.length} more needed`) : hint}
            </p>
          </div>
          <div className="space-y-1.5">
            {idxs.map((i) => (
              <div
                key={i}
                draggable
                onDragStart={(e) => { setDragging(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); }}
                onDragEnd={() => { setDragging(null); setOverBucket(null); }}
                className={`flex items-center gap-2 rounded-small border border-divider bg-background px-2 py-1.5 cursor-grab active:cursor-grabbing ${
                  dragging === i ? "opacity-40" : ""
                }`}
              >
                <p className="text-tiny text-default-700 flex-1 min-w-0 truncate" title={articles[i]}>
                  {articles[i]!.replace(/\s+/g, " ").slice(0, 60)}
                </p>
                <span className="text-tiny text-default-400 shrink-0">{articles[i]!.length}{t(" 字", "")}</span>
                {/* 拖曳在觸控螢幕與鍵盤上不能用，所以每一篇都有同樣功能的選單。 */}
                <select
                  aria-label={t("改分類", "Move to")}
                  value={b}
                  onChange={(e) => move(i, e.target.value as Bucket)}
                  className="text-tiny bg-transparent border border-divider rounded px-1 py-0.5 shrink-0"
                >
                  {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{en ? c.en : c.zh}</option>)}
                  <option value="none">{t("不使用", "Don't use")}</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      );
    };

    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{t("看一下分類對不對", "Check the sorting")}</h2>
          <p className="text-small text-default-600 mt-1">
            {classifyFailed
              ? t("自動分類這次沒成功，請把每一篇拖到對的類別（或用右邊的選單）。", "Automatic sorting didn't work this time — drag each article to the right type, or use the menu on the right.")
              : t("分錯的直接拖到對的類別（或用右邊的選單）。每一類至少 2 篇才會學。", "Drag anything that's in the wrong place (or use the menu on the right). A type needs at least 2 articles to be learned.")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {CATEGORIES.map((c) => zone(c.id, en ? c.en : c.zh, en ? c.hintEn : c.hintZh))}
          {zone("none", t("不使用", "Don't use"), t("哪一類都不像的放這裡", "Anything that doesn't fit"))}
        </div>

        {errorLine}

        <div className="flex items-center justify-between gap-2 pt-1">
          <Button variant="light" size="sm" startContent={<ChevronLeftIcon size={14} />} onPress={() => setStage("paste")}>
            {t("回去改文章", "Back")}
          </Button>
          <Button
            color="primary" style={{ background: "#171717" }} className="font-semibold"
            isLoading={starting}
            isDisabled={readyCats.length === 0}
            onPress={goStart}
          >
            {readyCats.length === 0
              ? t("至少要有一類滿 2 篇", "At least one type needs 2 articles")
              : t(`開始學這 ${readyCats.length} 類的寫法（約一分鐘）`, `Learn these ${readyCats.length} type(s) (about a minute)`)}
          </Button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  if (stage === "done") {
    return (
      <div className="space-y-4 py-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <DoneIcon size={18} className="text-success" /> {t("學好了", "Done")}
        </h2>
        <ul className="text-small text-default-700 space-y-1.5 leading-relaxed">
          <li>
            {t(
              `${doneInfo?.names.join("、") ?? ""}——各有一張這個品牌專屬的任務卡，之後照你的寫法寫。`,
              `${doneInfo?.names.join(", ") ?? ""} — each now has its own task card that writes your way.`,
            )}
          </li>
          {doneInfo?.voiceWritten && (
            <li>{t("語氣與常用詞已寫進品牌大腦（策略層「文字」頁的品牌口吻），其他任務卡寫文時也會讀到。", "Tone and pet phrases are saved to the brand brain (Brand voice on the Copy page), so every other card reads them too.")}</li>
          )}
          <li className="text-default-500">
            {t("任務卡可以在「我的任務卡」改名、複製到其他通路，或再調整寫法。", "You can rename these cards, copy them to other channels or tune them under My task cards.")}
          </li>
        </ul>
        <div className="flex justify-end">
          <Button color="primary" style={{ background: "#171717" }} className="font-semibold" onPress={onDone}>
            {t("繼續", "Continue")}
          </Button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // stage === "learn"：進度＋左右對照＋像／不像
  const current = cards.find((c) => c.category === selected) ?? cards[0] ?? null;
  const unreviewed = cards.filter((c) => c.phase === "review" && c.verdict !== "like").length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("像不像你們寫的？", "Does this sound like you?")}</h2>
        <p className="text-small text-default-600 mt-1">
          {t(
            "每一類用你們自己的題目試寫一篇，跟原文左右對照。像就按「像」；不像就說哪裡不像，我們照你說的修到像為止。",
            "Each type gets a test piece on one of your own topics, side by side with your originals. Tell us what's off and we'll fix it until it sounds right.",
          )}
        </p>
      </div>

      {cards.length === 0 && (
        <p className="text-small text-default-500">{statusQuery.isLoading ? t("讀取中…", "Loading…") : t("還沒有任何一類開始學。", "Nothing has been learned yet.")}</p>
      )}

      <div className="flex flex-wrap gap-1.5" role="tablist">
        {cards.map((c) => {
          const active = current?.cardId === c.cardId;
          return (
            <button
              key={c.cardId}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelected(c.category)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-small transition ${
                active ? "border-neutral-900 bg-neutral-900 text-white" : "border-divider text-default-700 hover:bg-default-100"
              }`}
            >
              {catLabel(c.category)}
              {isWorking(c) && <WorkingIcon size={11} className="animate-spin" />}
              {c.phase === "failed" && <WarningIcon size={11} className={active ? "" : "text-danger"} />}
              {!isWorking(c) && c.verdict === "like" && <CheckIcon size={11} className={active ? "" : "text-success"} />}
            </button>
          );
        })}
      </div>

      {current && (
        <CategoryPanel
          key={current.cardId}
          card={current}
          en={en}
          busy={feedbackMut.isPending || retryMut.isPending}
          onLike={async () => {
            setError(null);
            try { await feedbackMut.mutateAsync({ brandId, cardId: current.cardId, verdict: "like" }); await refresh(); }
            catch (e: any) { setError(String(e?.message ?? e)); }
          }}
          onUnlike={async (note) => {
            setError(null);
            try { await feedbackMut.mutateAsync({ brandId, cardId: current.cardId, verdict: "unlike", note }); await refresh(); return true; }
            catch (e: any) { setError(String(e?.message ?? e)); return false; }
          }}
          onRetry={async (topic) => {
            setError(null);
            try { await retryMut.mutateAsync({ brandId, cardId: current.cardId, ...(topic ? { topic } : {}) }); await refresh(); }
            catch (e: any) { setError(String(e?.message ?? e)); }
          }}
        />
      )}

      {errorLine}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-divider">
        <div className="flex items-center gap-2 pt-3">
          <Button variant="light" size="sm" onPress={() => { setError(null); setStage("paste"); }}>
            {t("重新貼文章", "Paste different articles")}
          </Button>
          {onSkip && liked.length === 0 && (
            <Button variant="light" size="sm" onPress={onSkip}>{t("先跳過，之後再弄", "Skip for now")}</Button>
          )}
        </div>
        <div className="flex items-center gap-3 pt-3">
          {liked.length > 0 && unreviewed > 0 && (
            <span className="text-tiny text-default-500">
              {t(`還有 ${unreviewed} 類沒按「像」，不會上架（之後可以回來繼續）`, `${unreviewed} type(s) not confirmed yet — they won't be published`)}
            </span>
          )}
          <Button
            color="primary" style={{ background: "#171717" }} className="font-semibold"
            isDisabled={liked.length === 0 || anyWorking}
            isLoading={finishMut.isPending}
            onPress={goFinish}
          >
            {liked.length === 0
              ? t("至少確認一類", "Confirm at least one")
              : t(`確認，建立 ${liked.length} 張任務卡`, `Confirm — create ${liked.length} card(s)`)}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CategoryPanel({
  card, en, busy, onLike, onUnlike, onRetry,
}: {
  card: VoiceCardView;
  en: boolean;
  busy: boolean;
  onLike: () => void;
  onUnlike: (note: string) => Promise<boolean>;
  onRetry: (topic?: string) => void;
}) {
  const t = (zh: string, e: string) => (en ? e : zh);
  const [sampleIdx, setSampleIdx] = React.useState(0);
  const [unlikeOpen, setUnlikeOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [topicOpen, setTopicOpen] = React.useState(false);
  const [topicDraft, setTopicDraft] = React.useState(card.topic);
  const sample = card.samples[Math.min(sampleIdx, card.samples.length - 1)] ?? "";

  if (card.phase === "failed") {
    return (
      <div className="rounded-medium border border-divider p-4 space-y-3">
        <p className="text-small text-danger flex items-start gap-1.5">
          <WarningIcon size={13} className="mt-1 shrink-0" />
          {t("這一類沒有學成功：", "This type didn't work: ")}{card.error ?? t("原因不明", "unknown reason")}
        </p>
        <Button size="sm" variant="flat" isLoading={busy} startContent={<RegenerateIcon size={13} />} onPress={() => onRetry()}>
          {t("重試", "Try again")}
        </Button>
      </div>
    );
  }

  if (isWorking(card)) {
    const steps = card.phase === "revising"
      ? [t("照你說的修改寫法", "Revising the rules from your note"), t("重新試寫一篇", "Writing a new test piece")]
      : [
          t(`量 ${card.measured.count} 篇的字數、語氣、結構、常用詞`, `Measuring ${card.measured.count} articles`),
          t("反推成這個品牌的寫法", "Turning that into this brand's rules"),
          t("用你們自己的題目試寫一篇", "Writing a test piece on your own topic"),
        ];
    const at = card.phase === "revising" ? 0 : card.phase === "writing" ? steps.length - 1 : 1;
    return (
      <div className="rounded-medium border border-divider p-4 space-y-2.5">
        {steps.map((s, i) => (
          <div key={s} className={`flex items-center gap-2 text-small ${i > at ? "text-default-400" : "text-default-800"}`}>
            {i < at
              ? <CheckIcon size={12} className="text-success" />
              : i === at
                ? <WorkingIcon size={12} className="animate-spin" />
                : <span className="inline-block w-3" aria-hidden />}
            {s}
          </div>
        ))}
        <p className="text-tiny text-default-500 pt-1">{t("大約一分鐘。可以先看別的類別。", "About a minute. Feel free to look at another type meanwhile.")}</p>
      </div>
    );
  }

  // review
  return (
    <div className="space-y-3">
      <div className="rounded-medium bg-default-50 border border-divider px-3 py-2.5 space-y-1 text-small text-default-700">
        <p>
          <span className="font-semibold text-default-900">{t("從你的文章量出來的", "Measured from your articles")}</span>
          {t(`　${card.measured.count} 篇｜${card.measured.minChars}–${card.measured.maxChars} 字`, ` — ${card.measured.count} articles, ${card.measured.minChars}–${card.measured.maxChars} characters`)}
        </p>
        {card.profile?.tone && <p><span className="text-default-500">{t("語氣　", "Tone: ")}</span>{card.profile.tone}</p>}
        {card.profile?.structure && <p><span className="text-default-500">{t("結構　", "Structure: ")}</span>{card.profile.structure}</p>}
        {!!card.profile?.phrases.length && (
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="text-default-500">{t("常用詞", "Pet phrases")}</span>
            {card.profile.phrases.map((p) => (
              <span key={p.text} className="rounded-full border border-divider bg-background px-2 py-0.5 text-tiny" title={t(`出現在 ${p.count} 篇`, `In ${p.count} articles`)}>
                {p.text}
              </span>
            ))}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-medium border border-divider flex flex-col min-h-0">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-divider">
            <p className="text-small font-semibold">{t("你的原文", "Your original")}</p>
            <div className="flex items-center gap-1 text-tiny text-default-500">
              <button type="button" aria-label={t("上一篇", "Previous")} disabled={sampleIdx === 0} onClick={() => setSampleIdx((i) => Math.max(0, i - 1))} className="p-1 disabled:opacity-30">
                <ChevronLeftIcon size={12} />
              </button>
              {Math.min(sampleIdx, card.samples.length - 1) + 1} / {card.samples.length}
              <button type="button" aria-label={t("下一篇", "Next")} disabled={sampleIdx >= card.samples.length - 1} onClick={() => setSampleIdx((i) => Math.min(card.samples.length - 1, i + 1))} className="p-1 disabled:opacity-30">
                <ChevronRightIcon size={12} />
              </button>
            </div>
          </div>
          <div className="px-3 py-2.5 text-small whitespace-pre-wrap leading-relaxed overflow-y-auto max-h-[300px]">{sample}</div>
          <p className="px-3 py-1.5 text-tiny text-default-400 border-t border-divider">{sample.length}{t(" 字", " characters")}</p>
        </div>

        <div className="rounded-medium border border-neutral-900 flex flex-col min-h-0">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-divider">
            <p className="text-small font-semibold">
              {t("試寫", "Test piece")}
              {card.rounds > 0 && <span className="text-default-500 font-normal">{t(`　第 ${card.rounds + 1} 版`, ` · v${card.rounds + 1}`)}</span>}
            </p>
            <button type="button" className="text-tiny text-default-500 underline underline-offset-2" onClick={() => { setTopicDraft(card.topic); setTopicOpen((o) => !o); }}>
              {t("換題目", "Change topic")}
            </button>
          </div>
          <p className="px-3 pt-2 text-tiny text-default-500">{t("題目：", "Topic: ")}{card.topic}</p>
          {topicOpen && (
            <div className="px-3 pt-2 flex items-end gap-2">
              <Textarea aria-label={t("試寫題目", "Test topic")} size="sm" minRows={1} maxRows={3} value={topicDraft} onValueChange={setTopicDraft} />
              <Button size="sm" variant="flat" isLoading={busy} isDisabled={topicDraft.trim().length < 2} onPress={() => { setTopicOpen(false); onRetry(topicDraft.trim()); }}>
                {t("重寫", "Rewrite")}
              </Button>
            </div>
          )}
          <div className="px-3 py-2.5 text-small whitespace-pre-wrap leading-relaxed overflow-y-auto max-h-[300px]">{card.trial}</div>
          <p className={`px-3 py-1.5 text-tiny border-t border-divider ${card.trialInRange === false ? "text-warning-600" : "text-default-400"}`}>
            {(card.trial ?? "").length}{t(" 字", " characters")}
            {card.trialInRange === false && t(`（原文是 ${card.measured.minChars}–${card.measured.maxChars} 字）`, ` (originals run ${card.measured.minChars}–${card.measured.maxChars})`)}
          </p>
        </div>
      </div>

      {card.verdict === "like" && !unlikeOpen ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-small text-success flex items-center gap-1.5"><CheckIcon size={13} /> {t("你說這一類像。", "You confirmed this one.")}</p>
          <Button size="sm" variant="light" onPress={() => setUnlikeOpen(true)}>{t("還是想再改", "Actually, change something")}</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {!unlikeOpen && (
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="bordered" isDisabled={busy} onPress={() => setUnlikeOpen(true)}>{t("不像", "Not quite")}</Button>
              <Button size="sm" color="primary" style={{ background: "#171717" }} isLoading={busy} startContent={!busy && <CheckIcon size={13} />} onPress={onLike}>
                {t("像", "Sounds like us")}
              </Button>
            </div>
          )}
          {unlikeOpen && (
            <div className="rounded-medium border border-divider p-3 space-y-2">
              <Textarea
                autoFocus
                label={t("哪裡不像？", "What's off?")}
                placeholder={t("例：太正式了，我們都叫大家「茶友」；開頭不會用問句；不用驚嘆號", "e.g. Too formal — we call readers \"tea friends\"; we never open with a question; no exclamation marks")}
                minRows={2}
                maxRows={5}
                value={note}
                onValueChange={setNote}
              />
              <div className="flex items-center justify-end gap-2">
                <Button size="sm" variant="light" onPress={() => { setUnlikeOpen(false); setNote(""); }}>{t("取消", "Cancel")}</Button>
                <Button
                  size="sm" color="primary" style={{ background: "#171717" }}
                  isLoading={busy}
                  isDisabled={note.trim().length < 2}
                  onPress={async () => { if (await onUnlike(note.trim())) { setUnlikeOpen(false); setNote(""); } }}
                >
                  {t("照這樣修，再寫一篇", "Fix it and write another")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
