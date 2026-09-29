/**
 * StrategyDirectorPicker — 「換人選」與「查看背景」兩個檢視。
 *
 * 2026-09-23（CJ「品牌策略總監的三個人選，以及和品牌策略總監的互動方式，
 * 包括問問題的引導還有查看背景的使用者體驗設計」）：
 *
 * 上一版的「查看背景」是面板抬頭下面展開一段小字，塞在 400px 寬的抽屜裡，
 * 一段 bio 讀完就沒了；而「換人」是一顆 <select>。兩個都太小，看不出「這是
 * 一位有經歷的顧問」，也看不出三位差在哪。
 *
 * 這一版把兩者做成跟聊天同層的**檢視切換**（chat / roster / profile），三個
 * 檢視共用同一個固定高度：
 *   - 不會有「點一下面板就變大變小」的跳動——那正是 CJ 上一輪抱怨過的
 *     「我按一段文字後，一送出它的視窗就縮小」的同一類問題，所以這次一開始
 *     就讓三個檢視等高。
 *   - 不用彈出 modal 蓋住整個畫面：策略總監是常駐的側邊角色，開個全螢幕
 *     對話框跟「隨時問一下」的定位不合。
 *
 * roster：三位並排比較，每張卡有頭像 / 名字 / 角度標籤 / 專長一行；底下可以
 * 搜尋 mos_db 的 strategy 層 agent 換更多人選（CJ 選的「三位固定 +〈換更多
 * 人選〉可搜尋」）。
 * profile：那一位的真實背景——職稱、產業、專長、【工作經歷】【認證】、方法論，
 * 全部是 mos_db 原文。查不到的欄位就不顯示那個區塊（server 端的 sanitizeProse
 * 已經把「Details not available」這類匯入失敗的樣板字串濾成 null），不編一段補上。
 */
import React from "react";
import { BackIcon, CheckIcon, SearchIcon } from "../../../platform/components/icons";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import { type StrategistDirector, avatarSrcOf, roleLabelOf, signatureQuestionsOf, localeLabelOf } from "../../lib/strategistDirectors";

const CARD = {
  border: "1.5px solid #E5E5E5", borderRadius: 12, background: "#fff",
  padding: "10px 12px", display: "flex", gap: 10, alignItems: "flex-start",
} as const;

/** 三位人選 + 搜尋更多。 */
export function DirectorRoster({
  directors, currentAgentId, onPick, onViewProfile, onBack, height,
}: {
  directors: StrategistDirector[];
  currentAgentId: number | null;
  onPick: (d: StrategistDirector) => void;
  onViewProfile: (d: StrategistDirector) => void;
  onBack: () => void;
  height: number;
}) {
  const { lang } = useLang();
  const en = lang === "en";
  const [q, setQ] = React.useState("");
  // 只有真的按了搜尋才打 API——每打一個字就查 16,000 筆 agent 沒必要。
  const [submitted, setSubmitted] = React.useState("");
  const searchQ = (trpc as any).strategistChat?.searchDirectors?.useQuery
    ? (trpc as any).strategistChat.searchDirectors.useQuery(
        { search: submitted, limit: 12 },
        { enabled: submitted.trim().length > 0, refetchOnWindowFocus: false },
      )
    : { data: null, isLoading: false };
  const results: StrategistDirector[] = searchQ?.data?.directors ?? [];
  const shown = submitted.trim() ? results : directors;

  return (
    <div style={{ height, display: "flex", flexDirection: "column", border: "2px solid #111", borderRadius: 18, background: "#fff", boxShadow: "4px 4px 0 rgba(17,17,17,0.15)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid #EFEDE8" }}>
        <button onClick={onBack} aria-label={en ? "Back to chat" : "回到對話"}
          style={{ border: "none", background: "transparent", cursor: "pointer", color: "#525252", display: "flex", padding: 2 }}>
          <BackIcon size={16} />
        </button>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#171717" }}>
          {en ? "Choose your Strategy Director" : "選一位策略總監"}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {submitted.trim() && searchQ?.isLoading && (
          <div style={{ fontSize: 12.5, color: "#a3a3a3" }}>{en ? "Searching mos_db…" : "搜尋中…"}</div>
        )}
        {submitted.trim() && !searchQ?.isLoading && results.length === 0 && (
          <div style={{ fontSize: 12.5, color: "#737373" }}>
            {en ? `No strategy agent matched “${submitted}”.` : `沒有找到符合「${submitted}」的策略 agent。`}
          </div>
        )}
        {shown.map((d) => {
          const isCurrent = d.agentId === currentAgentId;
          return (
            <div key={d.agentId} style={{ ...CARD, borderColor: isCurrent ? "#171717" : "#E5E5E5" }}>
              <img src={avatarSrcOf(d)} alt="" style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#171717" }}>{d.name}</span>
                  <span style={{
                    fontSize: 10.5, fontWeight: 700, color: "#525252", background: "#F5F4F2",
                    border: "1px solid #E5E5E5", borderRadius: 999, padding: "1px 7px",
                  }}>{roleLabelOf(d, en)}</span>
                  {isCurrent && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: "#047857", display: "flex", alignItems: "center", gap: 2 }}>
                      <CheckIcon size={11} />{en ? "current" : "目前"}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "#737373", marginTop: 2 }}>{d.title}</div>
                {d.specialty && (
                  <div style={{ fontSize: 11.5, color: "#525252", marginTop: 4, lineHeight: 1.5,
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {d.specialty}
                  </div>
                )}
                {/* 2026-09-24（CJ「服飾 → fallback、不動產 → 對不到…這各狀況要提共
                    備用的人選」）：對不上產業時只丟一位預設顧問、還不給第二個選擇，
                    使用者只能接受或放棄。這裡把 server 算好的備用人選列出來——
                    第一種是「同產業但別的市場」（服飾在繁中沒人，但中國/東南亞有），
                    第二種是「同角色繁中但別的產業」（不動產那種完全對不到的）。 */}
                {d.isFallback && d.alternatives.length > 0 && (
                  <div style={{ marginTop: 7, paddingTop: 7, borderTop: "1px dashed #E5E5E5" }}>
                    <div style={{ fontSize: 10.5, color: "#a3a3a3", fontWeight: 700, marginBottom: 4 }}>
                      {en ? "No match for your industry — backups:" : "沒有你產業的繁中人選，備用："}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {d.alternatives.map((alt) => {
                        const loc = localeLabelOf(alt.locale, en);
                        return (
                          <button
                            key={alt.agentId}
                            onClick={() => onPick(alt)}
                            title={alt.title}
                            style={{
                              fontSize: 11, border: "1px solid #D4D4D4", borderRadius: 999,
                              padding: "3px 9px", background: "#fff", color: "#404040", cursor: "pointer",
                              maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}
                          >
                            {alt.name}
                            <span style={{ color: "#a3a3a3" }}>
                              {"　"}{alt.title.replace(/^[^｜|]*[｜|]\s*/, "")}{loc ? `・${loc}` : ""}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                  <button onClick={() => onPick(d)} disabled={isCurrent}
                    style={{
                      fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: "4px 11px", cursor: isCurrent ? "default" : "pointer",
                      border: "1.5px solid #171717", background: isCurrent ? "#F5F4F2" : "#171717",
                      color: isCurrent ? "#a3a3a3" : "#fff",
                    }}>
                    {isCurrent ? (en ? "Talking to them" : "正在跟他聊") : (en ? "Talk to them" : "找他聊")}
                  </button>
                  <button onClick={() => onViewProfile(d)}
                    style={{ fontSize: 11.5, fontWeight: 600, border: "1px solid #D4D4D4", borderRadius: 999, padding: "4px 11px", background: "#fff", color: "#525252", cursor: "pointer" }}>
                    {en ? "Background" : "查看背景"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: "1px solid #E5E5E5", padding: 10, display: "flex", gap: 8, alignItems: "center" }}>
        <SearchIcon size={14} color="#a3a3a3" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setSubmitted(q); } }}
          placeholder={en ? "Search more directors (e.g. beauty, pricing)" : "換更多人選（例如：美妝、定價、B2B）"}
          style={{ flex: 1, fontSize: 12.5, padding: "6px 10px", borderRadius: 9, border: "1px solid #D4D4D4", outline: "none", minWidth: 0 }}
        />
        {submitted.trim() ? (
          <button onClick={() => { setQ(""); setSubmitted(""); }}
            style={{ fontSize: 11.5, border: "1px solid #D4D4D4", borderRadius: 999, padding: "4px 10px", background: "#fff", color: "#525252", cursor: "pointer", whiteSpace: "nowrap" }}>
            {en ? "Reset" : "回到三位"}
          </button>
        ) : (
          <button onClick={() => setSubmitted(q)} disabled={!q.trim()}
            style={{ fontSize: 11.5, fontWeight: 700, border: "1.5px solid #171717", borderRadius: 999, padding: "4px 12px", background: q.trim() ? "#171717" : "#F5F4F2", color: q.trim() ? "#fff" : "#a3a3a3", cursor: q.trim() ? "pointer" : "default" }}>
            {en ? "Search" : "搜尋"}
          </button>
        )}
      </div>
    </div>
  );
}

/** 一位總監的完整背景——全部是 mos_db 原文。 */
export function DirectorProfile({
  director, isCurrent, onPick, onBack, height,
}: {
  director: StrategistDirector;
  isCurrent: boolean;
  onPick: (d: StrategistDirector) => void;
  onBack: () => void;
  height: number;
}) {
  const { lang } = useLang();
  const en = lang === "en";
  const questions = signatureQuestionsOf(director, en);

  const Section = ({ title, body }: { title: string; body: string }) => (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, color: "#a3a3a3", textTransform: "uppercase", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12.5, lineHeight: 1.7, color: "#404040", whiteSpace: "pre-wrap" }}>{body}</div>
    </div>
  );

  return (
    <div style={{ height, display: "flex", flexDirection: "column", border: "2px solid #111", borderRadius: 18, background: "#fff", boxShadow: "4px 4px 0 rgba(17,17,17,0.15)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid #EFEDE8" }}>
        <button onClick={onBack} aria-label={en ? "Back" : "返回"}
          style={{ border: "none", background: "transparent", cursor: "pointer", color: "#525252", display: "flex", padding: 2 }}>
          <BackIcon size={16} />
        </button>
        <img src={avatarSrcOf(director)} alt="" style={{ width: 30, height: 30, borderRadius: "50%" }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#171717" }}>{director.name}</div>
          <div style={{ fontSize: 10.5, color: "#737373" }}>{director.title}</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 13 }}>
        {director.isFallback && (
          <p style={{
            fontSize: 11, lineHeight: 1.6, color: "#525252", background: "#F5F4F2",
            border: "1px solid #E5E5E5", borderRadius: 8, padding: "7px 9px", margin: 0,
          }}>
            {en
              ? (director.alternatives.length > 0
                  ? "No director matched this brand's industry, so this is the default pick for this angle — the roster lists backups (same industry in another market, or another industry in Traditional Chinese)."
                  : "No director matched this brand's industry, so this is the default pick for this angle. Search below the roster to find one in your industry.")
              : (director.alternatives.length > 0
                  ? "沒有跟這個品牌產業對得上的繁中人選，這位是這個角度的預設人選——人選列表裡有列備用（同產業但別的市場，或繁中但別的產業）。"
                  : "沒有找到跟這個品牌產業對得上的人選，這位是這個角度的預設人選。想找你產業的，可以在人選列表下方搜尋。")}
          </p>
        )}
        {director.bio && <Section title={en ? "About" : "簡介"} body={director.bio} />}
        {director.specialty && <Section title={en ? "Specialties" : "專長"} body={director.specialty} />}
        {director.experience && <Section title={en ? "Experience" : "經歷"} body={director.experience} />}
        {director.methodology && <Section title={en ? "Methodology" : "方法論"} body={director.methodology} />}
        {questions.length > 0 && (
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, color: "#a3a3a3", textTransform: "uppercase", marginBottom: 5 }}>
              {en ? "Best asked about" : "最適合問他的問題"}
            </div>
            <ul style={{ margin: 0, paddingLeft: 17, display: "flex", flexDirection: "column", gap: 4 }}>
              {questions.map((q, i) => (
                <li key={i} style={{ fontSize: 12.5, lineHeight: 1.6, color: "#404040" }}>{q}</li>
              ))}
            </ul>
          </div>
        )}
        {/* mos_db 這一列什麼文字欄位都沒有的極端情況——說清楚是資料沒有，不是載入失敗。 */}
        {!director.bio && !director.specialty && !director.experience && !director.methodology && (
          <p style={{ fontSize: 12.5, color: "#737373", margin: 0 }}>
            {en ? "mos_db has no background text for this agent yet." : "mos_db 裡這位 agent 目前沒有背景描述。"}
          </p>
        )}
        <div style={{ fontSize: 10.5, color: "#a3a3a3" }}>
          {en ? `mos_db agent #${director.agentId} · ${director.slug}` : `資料來源：mos_db agent #${director.agentId}（${director.slug}）`}
        </div>
      </div>

      <div style={{ borderTop: "1px solid #E5E5E5", padding: 10 }}>
        <button onClick={() => onPick(director)} disabled={isCurrent}
          style={{
            width: "100%", fontSize: 12.5, fontWeight: 700, borderRadius: 10, padding: "8px 0", cursor: isCurrent ? "default" : "pointer",
            border: "1.5px solid #171717", background: isCurrent ? "#F5F4F2" : "#171717", color: isCurrent ? "#a3a3a3" : "#fff",
          }}>
          {isCurrent ? (en ? "You're talking to them" : "你正在跟他聊") : (en ? "Talk to them" : "找他聊")}
        </button>
      </div>
    </div>
  );
}
