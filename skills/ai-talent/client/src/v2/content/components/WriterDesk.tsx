/**
 * WriterDesk — 產出頁右欄的「主筆」面板（2026-09-29）。
 *
 * CJ「任務產出只有一個版本；右邊出現主筆的 agent，列出這樣寫的原因；旁邊列出不同的
 * agent，按下去本文就改寫成不同風格；要修改就跟該 agent 對話。目的是回到寫文案的習慣。」
 *
 * 取代原本「編輯／對話修改／換人重寫／為什麼這樣寫／重生這段」五個分頁：
 *   - 誰在寫：目前的主筆（頭像＋名字＋專長）
 *   - 為什麼這樣寫：主筆 → 這張卡真實登記的出處（不讓 AI 事後編理由）；
 *                   換過人 → 這位的寫法＋「以原稿為底改寫」，出處收在下面
 *   - 換個寫法（2026-10-09）：同通路的任務卡，自建 → 常用 → 其他；照那張卡的結構改寫，事實不變
 *   - 換口氣：一排小頭像（原本的「換人寫」），寫過的有小圓點，點回去是原樣不重寫
 *   - 跟這位說哪裡要改：改完直接進本文，可復原一步
 *
 * 純呈現元件：資料與 mutation 都在 RunPage。
 */
import React, { useLayoutEffect, useRef, useState } from "react";
import { landAgentHandoff } from "../lib/agentHandoff";
import { agentLabel, agentShortName, agentTitle } from "../../platform/lib/agentName";
import { Avatar, Button, Spinner, Textarea } from "@heroui/react";
import { HelpTip } from "../../platform/components/HelpTip";
import { RESTYLE_PREVIEW_COUNT, restyleTagLabel, type RestyleOption } from "../lib/restyleCards";

export interface DeskWriter {
  key: string;
  name: string;
  title: string;
  /** 英文介面用（主筆來自 DB agent 才有；沒有就照原文）。 */
  nameEn?: string;
  titleEn?: string;
  /** 一句話說這位的寫法（主筆沒有，主筆的理由看出處） */
  pitch?: string;
  avatarUrl?: string | null;
}

export function writerAvatar(w: Pick<DeskWriter, "name" | "avatarUrl">): string {
  return w.avatarUrl || `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(w.name || "Writer")}`;
}

export default function WriterDesk({
  en, lead, others, cards = [], activeKey, draftKeys, busyKey, onPick,
  leadReason, chatHistory, notes, chatBusy, onSend, canUndo, onUndo, onHandoffLanded,
}: {
  en: boolean;
  lead: DeskWriter;
  others: DeskWriter[];
  /** 換個寫法可以挑的任務卡（已排序：自建 → 常用 → 其他）。key 跟 writer key 共用 onPick／draftKeys。 */
  cards?: RestyleOption[];
  activeKey: string;
  draftKeys: string[];
  busyKey: string | null;
  onPick: (key: string) => void;
  /** 主筆為什麼這樣寫 —— 卡片登記的出處區塊 */
  leadReason: React.ReactNode;
  chatHistory: Array<{ role: "user" | "assistant"; content: string }>;
  /** 這個版本先前提過、還有效的修改意見（存在伺服器；RunPage 給 RefineNotesList）。 */
  notes?: React.ReactNode;
  chatBusy: boolean;
  onSend: (text: string) => Promise<boolean>;
  canUndo: boolean;
  onUndo: () => void;
  /** 從任務 modal 飛過來的頭像降落在這裡之後呼叫（RunPage 用來播文案展開）。 */
  onHandoffLanded?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const all = [lead, ...others];
  const active = all.find((w) => w.key === activeKey) ?? lead;
  const activeCard = cards.find((c) => c.key === activeKey) ?? null;
  const isLead = !activeCard && active.key === lead.key;
  const [allCards, setAllCards] = useState(false);
  // 沒展開只擺前幾張；正在用的那張不在前幾張裡也要看得到。
  const shownCards = allCards ? cards : (() => {
    const head = cards.slice(0, RESTYLE_PREVIEW_COUNT);
    return activeCard && !head.includes(activeCard) ? [...head.slice(0, RESTYLE_PREVIEW_COUNT - 1), activeCard] : head;
  })();
  const busy = !!busyKey || chatBusy;
  const avatarRef = useRef<HTMLDivElement>(null);
  // 只在第一次掛上時接：之後換人寫不會再觸發。layout effect＝在第一次畫面出來前就
  // 把本文設成「待展開」，不會先閃一下完整本文再收起來。
  useLayoutEffect(() => {
    if (landAgentHandoff(avatarRef.current)) onHandoffLanded?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      {/* ── 誰在寫 ── */}
      <div className="flex items-center gap-2.5">
        <div ref={avatarRef} className="h-10 w-10 shrink-0 rounded-full">
          <Avatar src={writerAvatar(active)} className="h-10 w-10" />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-[12px] text-default-500">
            {activeCard ? (en ? "Restructured as" : "換了寫法") : isLead ? (en ? "Lead writer" : "主筆") : (en ? "Rewritten by" : "改寫")}
          </p>
          <p className="truncate text-[15px] font-semibold text-default-900">
            {activeCard ? activeCard.name : agentLabel(active, en ? "en" : "zh")}
            {!activeCard && active.title && <span className="ml-1.5 text-[13px] font-normal text-default-500">{agentTitle(active, en ? "en" : "zh")}</span>}
          </p>
        </div>
      </div>

      {/* ── 為什麼這樣寫 ── */}
      <div className="space-y-1.5">
        <p className="text-[13px] font-semibold text-default-800">{en ? "Why it's written this way" : "為什麼這樣寫"}</p>
        {isLead ? leadReason : (
          <>
            <p className="text-[13px] leading-relaxed text-default-700">
              {activeCard
                ? (en
                  ? <>{agentShortName(lead, "en")}&rsquo;s draft, restructured to follow the &ldquo;{activeCard.name}&rdquo; task card. Facts stay the same.</>
                  : <>以 {lead.name} 的稿為底，改成「{activeCard.name}」這張任務卡的結構。事實照原稿，不新增。</>)
                : (en
                  ? <>{agentShortName(active, "en")} rewrote {agentShortName(lead, "en")}&rsquo;s draft in their own style — {active.pitch}. Facts and structure stay the same.</>
                  : <>{active.name} 以 {lead.name} 的稿為底，改成自己的寫法：{active.pitch}。事實與結構不變。</>)}
            </p>
            <details className="text-[12px]">
              <summary className="cursor-pointer select-none text-default-500">{en ? "Where the original structure comes from" : "原稿的結構出處"}</summary>
              <div className="mt-1.5">{leadReason}</div>
            </details>
          </>
        )}
      </div>

      {/* ── 換個寫法：照另一張任務卡的結構改寫（自建 → 常用 → 同通路其他卡） ── */}
      {cards.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1 text-[13px] font-semibold text-default-800">
              {en ? "Try another structure" : "換個寫法"}
              <HelpTip>{en
                ? "Rewrites this post to follow another task card. Facts stay the same, and every version is kept — click back any time."
                : "照另一張任務卡的結構改寫這一篇。事實不變；每個寫過的版本都留著，點回去就是原樣。"}</HelpTip>
            </p>
            {cards.length > RESTYLE_PREVIEW_COUNT && (
              <button type="button" onClick={() => setAllCards((v) => !v)} className="text-[12px] text-default-500 hover:text-default-800">
                {allCards ? (en ? "Show fewer" : "收起") : (en ? `See all ${cards.length}` : `看全部 ${cards.length} 張`)}
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {shownCards.map((c) => {
              const on = c.key === activeKey;
              const has = draftKeys.includes(c.key);
              return (
                <button
                  key={c.key}
                  type="button"
                  disabled={busy && busyKey !== c.key}
                  onClick={() => { if (!on) onPick(c.key); }}
                  title={c.name}
                  className={`relative rounded-lg border px-2 py-1.5 text-left transition disabled:opacity-40 ${on ? "border-default-900 bg-default-100" : "border-default-200 hover:border-default-400"}`}
                >
                  <span className="block text-[11px] leading-tight text-default-500">{restyleTagLabel(c.tag, en)}</span>
                  <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-snug text-default-900">{c.name}</span>
                  {busyKey === c.key && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/70"><Spinner size="sm" color="default" /></span>
                  )}
                  {has && !on && busyKey !== c.key && (
                    <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-default-500" aria-label={en ? "Draft kept" : "寫過"} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 換口氣：同一個結構，換一位寫 ── */}
      <div className="flex items-center gap-1.5">
        <p className="mr-0.5 shrink-0 text-[12px] text-default-500">{en ? "Voice" : "換口氣"}</p>
        {all.map((w) => {
          const on = !activeCard && w.key === active.key;
          const has = draftKeys.includes(w.key) || w.key === lead.key;
          const isLeadChip = w.key === lead.key;
          return (
            <button
              key={w.key}
              type="button"
              disabled={busy && busyKey !== w.key}
              onClick={() => { if (!on) onPick(w.key); }}
              title={isLeadChip
                ? (en ? `Original — ${agentLabel(w, "en")}` : `原稿｜${agentLabel(w, "zh")}`)
                : `${agentLabel(w, en ? "en" : "zh")}｜${agentTitle(w, en ? "en" : "zh")}${w.pitch ? `｜${w.pitch}` : ""}`}
              aria-label={isLeadChip ? (en ? "Original draft" : "原稿") : agentLabel(w, en ? "en" : "zh")}
              className={`relative rounded-full ring-2 transition disabled:opacity-40 ${on ? "ring-default-900" : "ring-transparent hover:ring-default-300"}`}
            >
              <Avatar src={writerAvatar(w)} className="h-7 w-7" />
              {busyKey === w.key && (
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-white/70"><Spinner size="sm" color="default" /></span>
              )}
              {has && !on && busyKey !== w.key && (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-white bg-default-500" aria-label={en ? "Draft kept" : "寫過"} />
              )}
            </button>
          );
        })}
        {!isLead && (
          <button type="button" disabled={busy} onClick={() => onPick(lead.key)} className="ml-auto text-[12px] text-default-500 hover:text-default-800 disabled:opacity-40">
            {en ? "Back to original" : "回原稿"}
          </button>
        )}
      </div>

      {/* ── 跟這位說哪裡要改 ── */}
      <div className="space-y-2 border-t border-default-100 pt-3">
        <p className="text-[13px] font-semibold text-default-800">
          {en ? `Tell ${agentShortName(active, "en")} what to change` : `跟 ${active.name} 說哪裡要改`}
        </p>
        {chatHistory.length > 0 && (
          <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg bg-default-50 p-2">
            {chatHistory.slice(-4).map((m, i) => (
              <p key={i} className="text-[12.5px] leading-relaxed text-default-800">
                <span className="mr-1 font-semibold">{m.role === "user" ? (en ? "You" : "你") : agentShortName(active, en ? "en" : "zh")}{en ? ":" : "："}</span>
                {m.content.slice(0, 180)}{m.content.length > 180 ? "…" : ""}
              </p>
            ))}
          </div>
        )}
        <Textarea
          placeholder={en ? "e.g. shorter opening, add the event date…" : "例如：開頭短一點、補上活動日期…"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          minRows={2}
        />
        {notes}
        <div className="flex gap-2">
          <Button
            className="flex-1 bg-default-900 font-medium text-white"
            isDisabled={!draft.trim() || busy}
            isLoading={chatBusy}
            onPress={async () => { if (await onSend(draft.trim())) setDraft(""); }}
          >
            {en ? "Send" : "請他改"}
          </Button>
          {canUndo && (
            <Button variant="flat" isDisabled={busy} onPress={onUndo}>{en ? "Undo" : "復原"}</Button>
          )}
        </div>
      </div>
    </div>
  );
}
