/**
 * StrategyHistoryModal — 「要看跟哪一位的對話紀錄」。
 *
 * 2026-09-26（CJ「歷史的對話，讓人們可以在對話中，按一個鈕，跳出一個視窗，
 * 決定要看跟哪個 AGENT 的對話紀錄」＋「篩選要跟品牌頁一致」）：
 *
 * 上一版的歷史是塞在對話面板裡的一段小清單，而且**只有目前這一位**的歷史——
 * 使用者想看「上次跟定價那位聊的那串」就得先換人、再開歷史，而換人本身又會
 * 影響他接下來要問的對象。選人跟看紀錄是兩件事，混在一起就互相絆住。
 *
 * 所以：一顆按鈕 → 一個視窗 → 先選人、再選那串。
 *
 * ── 選人的長相跟品牌頁一致 ───────────────────────────────────────────
 * 人選卡片用的是 StrategyDirectorPicker（品牌頁「換人」）同一套視覺語言：
 * 頭像 + 名字 + 角度標籤 + 職稱，選中的打勾。同一件事（挑一位總監）在站上
 * 只有一種長相——不然使用者要學兩次。
 *
 * ── 唯讀 ─────────────────────────────────────────────────────────────
 * 這個視窗只負責「挑一串」；挑完把 (agentId, conversationId) 交給呼叫端。
 * 已經收起來的那幾串是唯讀的（server 的 sendMessage 也擋），要繼續講就開新的。
 */
import React from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, Spinner } from "@heroui/react";
import { CheckIcon } from "../../../platform/components/icons";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import {
  type StrategistDirector, type StrategistScope, avatarSrcOf, roleLabelOf,
} from "../../lib/strategistDirectors";

export default function StrategyHistoryModal({
  open, onClose, brandId, scope, currentAgentId, onPickConversation,
}: {
  open: boolean;
  onClose: () => void;
  brandId: number;
  scope: StrategistScope;
  currentAgentId: number | null;
  /** 選好了：要看哪一位的哪一串。呼叫端負責切換人選並載入那串。 */
  onPickConversation: (agentId: number, conversationId: number) => void;
}) {
  const { lang } = useLang();
  const en = lang === "en";
  const L = (zh: string, e: string) => (en ? e : zh);

  // 預設先看目前這位的紀錄——多數情況使用者要找的就是剛剛那串。
  const [agentId, setAgentId] = React.useState<number | null>(currentAgentId);
  React.useEffect(() => { if (open) setAgentId(currentAgentId); }, [open, currentAgentId]);

  const listQ = (trpc as any).strategistChat?.listDirectors?.useQuery
    ? (trpc as any).strategistChat.listDirectors.useQuery(
        { brandId, scope, ...(currentAgentId ? { includeAgentId: currentAgentId } : {}) },
        { enabled: open && !!brandId, refetchOnWindowFocus: false },
      )
    : { data: null, isLoading: false };
  const directors: StrategistDirector[] = listQ?.data?.directors ?? [];

  const historyQ = (trpc as any).strategistChat?.history?.useQuery
    ? (trpc as any).strategistChat.history.useQuery(
        { brandId, agentId: agentId ?? 0 },
        { enabled: open && !!brandId && !!agentId, refetchOnWindowFocus: false },
      )
    : { data: [], isLoading: false };
  const rows: any[] = (historyQ?.data as any[]) ?? [];

  return (
    <Modal isOpen={open} onClose={onClose} size="2xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span className="text-medium font-semibold">{L("對話紀錄", "Conversation history")}</span>
          <span className="text-tiny text-default-500 font-normal">
            {L("先選一位，再選要看哪一串。已經結束的對話是唯讀的。",
               "Pick who you talked to, then which conversation. Past conversations are read-only.")}
          </span>
        </ModalHeader>
        <ModalBody className="pb-6">
          {/* 選人：跟品牌頁「換人」同一套卡片語言 */}
          {listQ?.isLoading ? (
            <div className="flex items-center gap-3 py-4">
              <Spinner size="sm" /><span className="text-small text-default-500">{L("載入中…", "Loading…")}</span>
            </div>
          ) : directors.length === 0 ? (
            <p className="text-small text-default-500">{L("這個品牌還沒有可用的總監人選。", "No directors available for this brand.")}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {directors.map((d) => {
                const on = d.agentId === agentId;
                return (
                  <button
                    key={d.agentId}
                    type="button"
                    onClick={() => setAgentId(d.agentId)}
                    className={`text-left rounded-xl border p-3 transition flex gap-2.5 items-start ${
                      on ? "border-foreground bg-default-50" : "border-divider hover:bg-default-50"}`}
                  >
                    <img
                      src={avatarSrcOf(d)}
                      alt=""
                      className="w-9 h-9 rounded-full object-cover shrink-0 bg-default-100"
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="text-small font-semibold truncate">{d.name}</span>
                        {on && <CheckIcon size={13} />}
                      </span>
                      <span className="block text-tiny text-default-500 truncate">{roleLabelOf(d, en)}</span>
                      <span className="block text-tiny text-default-400 truncate">{d.title}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* 那一位的每一串 */}
          <div className="mt-4">
            {historyQ?.isLoading ? (
              <div className="flex items-center gap-3 py-4">
                <Spinner size="sm" /><span className="text-small text-default-500">{L("載入中…", "Loading…")}</span>
              </div>
            ) : !agentId ? (
              <p className="text-small text-default-500">{L("先選一位。", "Pick someone first.")}</p>
            ) : rows.length === 0 ? (
              <p className="text-small text-default-500">
                {L("跟這一位還沒有任何對話紀錄。", "No conversations with this director yet.")}
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-divider">
                {rows.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => { onPickConversation(agentId, h.id); onClose(); }}
                    className="text-left py-2.5 px-1 hover:bg-default-50 transition rounded"
                  >
                    <p className="text-small truncate">
                      {/* 預覽是使用者自己講的第一句；只有開場白的那種照實說，不編標題 */}
                      {h.preview ?? L("（還沒聊過）", "(no messages yet)")}
                    </p>
                    <p className="text-tiny text-default-500">
                      {String(h.lastAt ?? "").slice(0, 10)}
                      {` · ${h.messageCount} ${L("則", "msgs")}`}
                      {h.isOpen ? L(" · 目前這串", " · current") : ""}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
