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
 *   - 換人寫：一排頭像，寫過的有小圓點，點回去是原樣不重寫
 *   - 跟這位說哪裡要改：改完直接進本文，可復原一步
 *
 * 純呈現元件：資料與 mutation 都在 RunPage。
 */
import React, { useLayoutEffect, useRef, useState } from "react";
import { landAgentHandoff } from "../lib/agentHandoff";
import { agentLabel, agentShortName, agentTitle } from "../../platform/lib/agentName";
import { Avatar, Button, Spinner, Textarea } from "@heroui/react";

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
  en, lead, others, activeKey, draftKeys, busyKey, onPick,
  leadReason, chatHistory, notes, chatBusy, onSend, canUndo, onUndo, onHandoffLanded,
}: {
  en: boolean;
  lead: DeskWriter;
  others: DeskWriter[];
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
  const isLead = active.key === lead.key;
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
          <p className="text-[12px] text-default-500">{isLead ? (en ? "Lead writer" : "主筆") : (en ? "Rewritten by" : "改寫")}</p>
          <p className="truncate text-[15px] font-semibold text-default-900">
            {agentLabel(active, en ? "en" : "zh")}
            {active.title && <span className="ml-1.5 text-[13px] font-normal text-default-500">{agentTitle(active, en ? "en" : "zh")}</span>}
          </p>
        </div>
      </div>

      {/* ── 為什麼這樣寫 ── */}
      <div className="space-y-1.5">
        <p className="text-[13px] font-semibold text-default-800">{en ? "Why it's written this way" : "為什麼這樣寫"}</p>
        {isLead ? leadReason : (
          <>
            <p className="text-[13px] leading-relaxed text-default-700">
              {en
                ? <>{agentShortName(active, "en")} rewrote {agentShortName(lead, "en")}&rsquo;s draft in their own style — {active.pitch}. Facts and structure stay the same.</>
                : <>{active.name} 以 {lead.name} 的稿為底，改成自己的寫法：{active.pitch}。事實與結構不變。</>}
            </p>
            <details className="text-[12px]">
              <summary className="cursor-pointer select-none text-default-500">{en ? "Where the structure comes from" : "結構出處"}</summary>
              <div className="mt-1.5">{leadReason}</div>
            </details>
          </>
        )}
      </div>

      {/* ── 換人寫 ── */}
      <div className="space-y-1.5">
        <p className="text-[13px] font-semibold text-default-800">{en ? "Try another writer" : "換人寫寫看"}</p>
        <div className="flex flex-wrap gap-2">
          {all.map((w) => {
            const on = w.key === active.key;
            const has = draftKeys.includes(w.key) || w.key === lead.key;
            return (
              <button
                key={w.key}
                type="button"
                disabled={busy && busyKey !== w.key}
                onClick={() => { if (!on) onPick(w.key); }}
                title={`${agentLabel(w, en ? "en" : "zh")}｜${agentTitle(w, en ? "en" : "zh")}${w.pitch ? `｜${w.pitch}` : ""}`}
                className={`group flex w-[58px] flex-col items-center gap-1 rounded-lg p-1 transition ${on ? "bg-default-100" : "hover:bg-default-50"} disabled:opacity-40`}
              >
                <span className={`relative rounded-full ring-2 ${on ? "ring-default-900" : "ring-transparent group-hover:ring-default-300"}`}>
                  <Avatar src={writerAvatar(w)} className="h-9 w-9" />
                  {busyKey === w.key && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-white/70"><Spinner size="sm" color="default" /></span>
                  )}
                  {has && !on && busyKey !== w.key && (
                    <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-default-500" aria-label={en ? "Draft kept" : "寫過"} />
                  )}
                </span>
                <span className="w-full truncate text-center text-[11.5px] leading-tight text-default-700">{w.key === lead.key ? (en ? "Lead" : "主筆") : w.name.split(" ")[0]}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[12px] text-default-500">
          {en ? "Each writer's draft is kept — click back any time." : "每一位寫過的稿都留著，點回去就是原樣。"}
        </p>
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
