/**
 * AeoVersionModal — 作品頁「轉成 AI 搜尋版」。
 *
 * 2026-10-10（CJ「將所有 onbrand 產出的內容，都增加 AI SEO 的作法……而且我們真實能做到」）。
 * AI 搜尋引用的是公開網頁、YouTube 與新聞，社群貼文幾乎不會被引用。所以寫完一篇社群貼文，
 * 在這裡把同一件事多做一份它讀得到的：官網問答，或 YouTube 標題＋說明欄。
 *
 * 流程：挑一種 → 產出 → 可以直接改 → 複製／存到專案。原貼文不動。
 * 畫面上只說做得到的事：格式讀得到；貼上官網或上傳影片才生效；會不會被引用不保證。
 * 規則在 server aeoContract.ts。
 */
import React from "react";
import { Modal, ModalBody, ModalContent, ModalHeader, Spinner } from "@heroui/react";
import { trpc } from "../../../lib/trpc";
import { showToastGlobal } from "../../platform/components/Toast";
import { friendlyError } from "../../platform/lib/friendlyError";
import { TASK_MODAL_CLASSNAMES, TASK_MODAL_HEADER } from "../../platform/components/taskModalStyle";
import { CopyIcon, Icon, SearchIcon, WarningIcon } from "../../platform/components/icons";

const INK = "#171717", META = "#6B6B6B", LINE = "#EAEAEA", SOFT = "#F6F6F5";

export type AeoTarget = "web-qa" | "yt-description";
type Fields = { question?: string; answer?: string; body?: string; title?: string; description?: string };

/** 官網／YouTube／新聞稿的產出本身就是 AI 讀得到的，不用再轉（server isAeoNativePlatform 同一條）。 */
export function canConvertToAeo(platform: string | null | undefined, taskId: string | null | undefined): boolean {
  if (/^(web|yt|pr)-/.test(String(taskId ?? ""))) return false;
  return !/^(website|web|youtube|yt|pr|press)$/i.test(String(platform ?? ""));
}

const TARGETS: { id: AeoTarget; icon: "website" | "youtube"; zh: string; en: string; noteZh: string; noteEn: string }[] = [
  { id: "web-qa", icon: "website", zh: "官網問答", en: "Website Q&A",
    noteZh: "一個顧客會問的問題，加一句可以單獨被引用的答案。附可貼上官網的網頁碼。",
    noteEn: "One question a customer would ask, with an answer that stands on its own. Includes page code for your site." },
  { id: "yt-description", icon: "youtube", zh: "YouTube 標題＋說明欄", en: "YouTube title + description",
    noteZh: "同一個主題拍成影片時，上傳要貼的標題與說明文字。",
    noteEn: "The title and description to paste when this topic becomes a video." },
];

export default function AeoVersionModal({ brandId, productId, eventId, caption, fromOutputId, en, onClose, onOpenOutput }: {
  brandId: number; productId?: number | null; eventId?: number | null;
  caption: string; fromOutputId?: number | null; en: boolean;
  onClose: () => void; onOpenOutput: (outputId: number) => void;
}) {
  const T = trpc as any;
  const utils = T.useUtils();
  const [target, setTarget] = React.useState<AeoTarget | null>(null);
  const [fields, setFields] = React.useState<Fields | null>(null);
  const [problems, setProblems] = React.useState<string[]>([]);
  const [noConvert, setNoConvert] = React.useState<string | null>(null);
  const [savedId, setSavedId] = React.useState<number | null>(null);

  const onErr = (e: any) => showToastGlobal(friendlyError(e, en ? "That didn't go through. Please try again." : "剛剛沒成功，再試一次。"), "error");
  const gen = T.quickTask.aeoVersion.useMutation({
    onSuccess: (r: any) => {
      if (!r?.ok) { onErr(new Error(r?.error || "failed")); setTarget(null); return; }
      if (r.noConvert) { setNoConvert(r.reason || (en ? "This post has no fact a customer question could be answered with." : "這篇沒有可以拿來回答顧客問題的事實。")); return; }
      setFields(r.fields); setProblems(r.problems ?? []);
    },
    onError: (e: any) => { onErr(e); setTarget(null); },
  });
  const save = T.quickTask.aeoSave.useMutation({
    onSuccess: (r: any) => { setSavedId(r.outputId); showToastGlobal(en ? "Saved to Projects" : "已存到專案", "success"); },
    onError: onErr,
  });

  const start = (t: AeoTarget) => {
    setTarget(t); setFields(null); setProblems([]); setNoConvert(null); setSavedId(null);
    gen.mutate({ brandId, target: t, caption, ...(productId ? { productId } : {}), ...(eventId ? { eventId } : {}) });
  };
  const back = () => { setTarget(null); setFields(null); setNoConvert(null); setSavedId(null); };
  const edit = (k: keyof Fields, v: string) => { setFields((f) => ({ ...(f ?? {}), [k]: v })); setSavedId(null); };

  const copy = async (text: string, okZh: string, okEn: string) => {
    try { await navigator.clipboard.writeText(text); showToastGlobal(en ? okEn : okZh, "success"); }
    catch { showToastGlobal(en ? "Couldn't copy. Select the text and copy it manually." : "複製沒成功，請手動選取複製。", "error"); }
  };
  const plain = () => (target === "web-qa"
    ? [fields?.question, fields?.answer, fields?.body]
    : [fields?.title, fields?.description]).filter(Boolean).join("\n\n");
  const copyHtml = async () => {
    try {
      const r = await utils.quickTask.aeoHtml.fetch({ fields: fields ?? {} });
      await copy(r.html, "已複製網頁碼", "Page code copied");
    } catch (e) { onErr(e); }
  };

  const label = "text-[13.5px] font-semibold";
  const box = "mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-[14px] leading-relaxed outline-none focus:border-neutral-900";
  const pill = "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13.5px] font-medium transition hover:border-neutral-900 disabled:opacity-40";
  const area = (k: keyof Fields, zh: string, enLabel: string, rows: number, hintZh?: string, hintEn?: string) => (
    <div>
      <label htmlFor={`aeo-${k}`} className={label} style={{ color: INK }}>{en ? enLabel : zh}</label>
      {hintZh && <span className="ml-2 text-[12.5px]" style={{ color: META }}>{en ? hintEn : hintZh}</span>}
      <textarea id={`aeo-${k}`} rows={rows} value={fields?.[k] ?? ""} onChange={(e) => edit(k, e.target.value)}
        className={box} style={{ borderColor: LINE, color: INK }} />
    </div>
  );

  return (
    <Modal isOpen onClose={onClose} size="2xl" scrollBehavior="inside" backdrop="blur" classNames={TASK_MODAL_CLASSNAMES}>
      <ModalContent>
        <ModalHeader className={TASK_MODAL_HEADER}>
          <span className="flex items-center gap-2 text-[17px] font-bold" style={{ color: INK }}><SearchIcon size={15} />{en ? "Make an AI-search version" : "轉成 AI 搜尋版"}</span>
          <span className="mt-1 text-[13px] font-normal" style={{ color: META }}>
            {en
              ? "AI search reads websites, YouTube and news, not social posts. This makes a version of the same post that it can read. Your post stays as it is."
              : "AI 搜尋讀的是官網、YouTube 與新聞，不是社群貼文。把這篇講的事，多做一份它讀得到的。原本的貼文不會動。"}
          </span>
        </ModalHeader>
        <ModalBody>
          {!target ? (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {TARGETS.map((t) => (
                <button key={t.id} type="button" onClick={() => start(t.id)}
                  className="flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition hover:border-neutral-900" style={{ borderColor: LINE }}>
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[15px]" style={{ background: SOFT, color: INK }}><Icon name={t.icon} size={15} /></span>
                  <span className="min-w-0">
                    <span className="block text-[14.5px] font-semibold" style={{ color: INK }}>{en ? t.en : t.zh}</span>
                    <span className="mt-0.5 block text-[13px] leading-snug" style={{ color: META }}>{en ? t.noteEn : t.noteZh}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : gen.isPending ? (
            <div className="flex items-center gap-3 rounded-2xl border px-4 py-6" style={{ borderColor: LINE }} aria-live="polite">
              <Spinner size="sm" />
              <span className="text-[14px]" style={{ color: META }}>{en ? "Writing it from your post…" : "正在照這篇貼文改寫…"}</span>
            </div>
          ) : noConvert ? (
            <section className="rounded-2xl border px-4 py-4" style={{ borderColor: LINE }} aria-live="polite">
              <p className="m-0 text-[14.5px] font-semibold" style={{ color: INK }}>{en ? "This post can't be turned into one." : "這篇轉不了。"}</p>
              <p className="m-0 mt-1.5 text-[13.5px] leading-relaxed" style={{ color: META }}>{noConvert}</p>
              <p className="m-0 mt-1.5 text-[13.5px] leading-relaxed" style={{ color: META }}>
                {en ? "Posts that state something about a product, a price, a how-to or an event work best." : "有講到產品、價格、做法或活動內容的貼文最適合轉。"}
              </p>
              <button type="button" className={`${pill} mt-3`} style={{ borderColor: LINE, color: INK }} onClick={back}>{en ? "Back" : "回上一步"}</button>
            </section>
          ) : fields ? (
            <section className="space-y-3">
              {target === "web-qa" ? (
                <>
                  {area("question", "問題", "Question", 1)}
                  {area("answer", "直接答案", "Direct answer", 3, "AI 會摘走的那一句：要有品牌名，單獨讀也懂", "The sentence AI lifts: names the brand, reads on its own")}
                  {area("body", "展開", "Details", 7)}
                </>
              ) : (
                <>
                  {area("title", "標題", "Title", 1)}
                  {area("description", "說明欄", "Description", 9, "前兩行最重要，收合時只看得到這兩行", "The first two lines matter most; they show when collapsed")}
                </>
              )}
              {problems.length > 0 && (
                <div className="rounded-xl border px-3.5 py-2.5" style={{ borderColor: LINE, background: SOFT }}>
                  <p className="m-0 flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: INK }}><WarningIcon size={12} />{en ? "Worth a look before you use it" : "用之前建議再看一下"}</p>
                  <ul className="m-0 mt-1 list-disc pl-5 text-[13px] leading-relaxed" style={{ color: META }}>
                    {problems.map((p) => <li key={p}>{p}</li>)}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button type="button" className={pill} style={{ borderColor: LINE, color: INK }} onClick={() => copy(plain(), "已複製文字", "Text copied")}><CopyIcon size={12} />{en ? "Copy text" : "複製文字"}</button>
                {target === "web-qa" && (
                  <button type="button" className={pill} style={{ borderColor: LINE, color: INK }} onClick={copyHtml}
                    title={en ? "The Q&A plus FAQ structured data, ready to paste into your site's HTML." : "問答加上 FAQ 結構化資料，可以直接貼進官網後台的 HTML。"}>
                    <CopyIcon size={12} />{en ? "Copy page code" : "複製網頁碼"}
                  </button>
                )}
                {savedId ? (
                  <button type="button" className={pill} style={{ borderColor: INK, color: INK }} onClick={() => onOpenOutput(savedId)}>{en ? "Saved. Open it" : "已存到專案，打開"}</button>
                ) : (
                  <button type="button" className={`${pill} text-white`} style={{ borderColor: INK, background: INK }} disabled={save.isPending}
                    onClick={() => save.mutate({ brandId, target, fields, ...(fromOutputId ? { fromOutputId } : {}) })}>
                    {save.isPending ? (en ? "Saving…" : "儲存中…") : (en ? "Save to Projects" : "存到專案")}
                  </button>
                )}
                <button type="button" className="ml-auto text-[13px] underline underline-offset-2" style={{ color: META }} onClick={back}>{en ? "Make the other kind" : "換另一種"}</button>
              </div>
              <p className="m-0 text-[12.5px] leading-relaxed" style={{ color: META }}>
                {target === "web-qa"
                  ? (en ? "It only counts once it's on your website. Whether AI cites it can't be guaranteed." : "貼上官網之後才算數。AI 會不會引用無法保證。")
                  : (en ? "It only counts once the video is uploaded with this text. Whether AI cites it can't be guaranteed." : "影片帶著這段文字上傳之後才算數。AI 會不會引用無法保證。")}
              </p>
            </section>
          ) : null}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
