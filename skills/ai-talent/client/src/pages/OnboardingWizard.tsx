/**
 * OnboardingWizard v2 — A2A 感品牌定位流程
 * - 詢問品牌名後立即派第一個 Agent 研究
 * - 顯示哪個 Agent 在做什麼
 * - 每個階段完成後讓用戶確認或修改
 * - 最後輸出兩種定位方案
 */
import { useState, useRef, useEffect } from "react";
import { trpc } from "../lib/trpc";

interface OnboardingProps {
  onComplete: (brandId: number, brandName: string) => void;
}

type MsgRole = "user" | "ai" | "agent-status" | "phase-result" | "system";

interface Msg {
  id: string;
  role: MsgRole;
  text: string;
  agentName?: string;
  agentTitle?: string;
  phase?: number;
}

// A2A Agent 角色定義
const AGENTS = {
  researcher: { name: "陳宇翔", title: "市場研究員", color: "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300" },
  strategist: { name: "王志豪", title: "品牌策略師", color: "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300" },
  copywriter: { name: "林佳穎", title: "文案創意總監", color: "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300" },
  pm: { name: "SoWork AI", title: "策略 PM", color: "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300" },
};

type Phase = "ask-name" | "phase1-research" | "confirm-phase1" | "ask-details" | "phase2-strategy" | "confirm-phase2" | "phase3-proposals" | "done";

export default function OnboardingWizard({ onComplete }: OnboardingProps) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [phase, setPhase] = useState<Phase>("ask-name");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [brandData, setBrandData] = useState<Record<string, string>>({});
  const [phase1Result, setPhase1Result] = useState<any>(null);
  const [phase2Result, setPhase2Result] = useState<any>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const runOnboarding = trpc.brand.runOnboarding.useMutation();
  const analyzeBrand = trpc.brand.analyzeBrand.useMutation();

  useEffect(() => {
    // 初始歡迎訊息
    addMsg("ai", "嗨！我是 SoWork AI，你的策略行銷 PM。\n\n我會帶領我們的 A2A 行銷研究團隊，幫你完成完整的品牌定位分析。整個過程你可以隨時修改、確認，最後會給你兩份完整的定位方案。\n\n先告訴我，你的品牌或公司叫什麼名字？");
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, loading]);

  const addMsg = (role: MsgRole, text: string, extra?: Partial<Msg>) => {
    setMessages(prev => [...prev, {
      id: `${Date.now()}-${Math.random()}`,
      role, text, ...extra
    }]);
  };

  // Phase 1：僅拿到品牌名，派研究員先跑市場調查
  const runPhase1 = async (name: string) => {
    setLoading(true);

    addMsg("agent-status", "正在召集研究團隊...", { agentName: "陳宇翔", agentTitle: "市場研究員" });
    await delay(600);
    addMsg("agent-status", `正在搜尋「${name}」的市場定位、競品與行業趨勢...`, { agentName: "陳宇翔", agentTitle: "市場研究員" });

    try {
      // 用 analyzeBrand 做第一階段（快速版，只用品牌名）
      const result = await analyzeBrand.mutateAsync({
        brandName: name,
        contentLanguage: "zh-TW",
        competitors: [],
      });

      setPhase1Result(result);
      addMsg("phase-result",
        `**第一階段研究完成** ✓\n\n**初步市場定位：**\n${result.positioning}\n\n**推測目標受眾：**\n${result.targetAudience}\n\n**初步差異化方向：**\n${result.differentiators?.slice(0,3).map((d: string, i: number) => `${i+1}. ${d}`).join('\n') ?? ''}`,
        { agentName: "陳宇翔", agentTitle: "市場研究員", phase: 1 }
      );

      await delay(300);
      addMsg("ai", "這是第一階段的初步研究結果。\n\n你覺得這個方向**準確嗎**？有什麼想補充或修正的嗎？（可以直接說「沒問題繼續」，或告訴我需要調整的地方）");
      setPhase("confirm-phase1");
    } catch (err: any) {
      addMsg("ai", `研究時遇到問題：${err?.message ?? "請稍後再試"}，讓我繼續問你幾個問題。`);
      setPhase("ask-details");
      addMsg("ai", "你的主要目標客群是誰？（例如：25-40 歲的行銷主管）");
    }
    setLoading(false);
  };

  // Phase 2：拿到更多資訊，派策略師跑完整定位
  const runPhase2 = async () => {
    setLoading(true);
    const data = brandData;

    addMsg("agent-status", "接手第一階段成果，開始深度策略分析...", { agentName: "王志豪", agentTitle: "品牌策略師" });
    await delay(800);
    addMsg("agent-status", "整合市場研究、競品分析、用戶洞察，建立品牌定位框架...", { agentName: "王志豪", agentTitle: "品牌策略師" });

    try {
      const competitors = data.competitors
        ? data.competitors.split(/[,，、]/).map(s => s.trim()).filter(Boolean)
        : [];

      const result = await runOnboarding.mutateAsync({
        brandName: data.brandName,
        industry: data.industry,
        websiteUrl: data.websiteUrl,
        targetAudience: data.targetAudience,
        competitors,
        existingPositioning: data.existingPositioning,
      });

      setPhase2Result(result);
      addMsg("phase-result",
        `**完整品牌策略分析完成** ✓\n\n**品牌定位一句話：**\n${result.analysis.positioning}\n\n**核心價值主張：**\n${result.analysis.valueProposition}\n\n**品牌語調：**\n${result.analysis.brandVoice}\n\n**溝通支柱：**\n${result.analysis.messagingPillars?.map((p: string, i: number) => `${i+1}. ${p}`).join('\n') ?? ''}`,
        { agentName: "王志豪", agentTitle: "品牌策略師", phase: 2 }
      );

      await delay(400);
      addMsg("ai", "第二階段完成！接下來由我們的文案總監，提出兩種不同風格的完整定位方案。\n\n你確認要繼續嗎？（或告訴我需要調整的地方）");
      setPhase("confirm-phase2");
    } catch (err: any) {
      addMsg("ai", `分析時發生錯誤：${err?.message ?? "請稍後再試"}`);
    }
    setLoading(false);
  };

  // Phase 3：文案總監輸出兩種方案
  const runPhase3 = async () => {
    setLoading(true);
    const analysis = phase2Result?.analysis ?? phase1Result;

    addMsg("agent-status", "基於策略分析，開始撰寫兩種完整定位方案...", { agentName: "林佳穎", agentTitle: "文案創意總監" });
    await delay(1000);

    const proposal1 = `**方案 A：理性專業型**\n\n**定位語：**「${analysis?.positioning ?? brandData.brandName + " — 專業行銷夥伴"}」\n\n**品牌個性：**專業、可信賴、數據導向\n\n**核心訴求：**用 AI 技術解決行銷痛點，讓品牌決策更有依據\n\n**適合渠道：**LinkedIn、B2B 媒體、白皮書、研討會\n\n**標準 Tagline：**「${analysis?.differentiators?.[0] ?? "以數據驅動品牌成長"}」`;

    const proposal2 = `**方案 B：感性故事型**\n\n**定位語：**「${brandData.brandName} — ${analysis?.targetAudience?.slice(0,15) ?? "為你而生"}的行銷夥伴」\n\n**品牌個性：**親切、有溫度、創意驅動\n\n**核心訴求：**理解行銷人的日常掙扎，用 AI 讓創意落地\n\n**適合渠道：**Instagram、Facebook、品牌故事、口碑行銷\n\n**標準 Tagline：**「${analysis?.valueProposition?.slice(0,25) ?? "讓每個品牌都能被看見"}」`;

    addMsg("phase-result",
      `**兩種品牌定位方案** ✓\n\n${proposal1}\n\n---\n\n${proposal2}`,
      { agentName: "林佳穎", agentTitle: "文案創意總監", phase: 3 }
    );

    await delay(500);
    addMsg("ai", "兩種方案已完成！\n\n你偏好哪個方案？或需要融合兩種的元素？告訴我你的選擇，我會將品牌定位儲存並啟動你的工作區。");
    setPhase("done");
    setLoading(false);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    addMsg("user", text);

    switch (phase) {
      case "ask-name": {
        setBrandData(prev => ({ ...prev, brandName: text }));
        setPhase("phase1-research");
        await runPhase1(text);
        break;
      }

      case "confirm-phase1": {
        const lower = text.toLowerCase();
        if (/沒問題|繼續|ok|好的|可以|對|正確/.test(lower)) {
          setPhase("ask-details");
          await delay(300);
          addMsg("ai", "很好！接下來我需要多一點資訊，讓策略師可以做更深入的分析。\n\n你們屬於哪個產業？（例如：AI 軟體、電商、美妝）");
        } else {
          // 用戶要修改
          addMsg("ai", `收到！我記下你的修正：「${text}」\n\n繼續問你幾個問題，來補充研究資料。\n\n你們屬於哪個產業？`);
          setBrandData(prev => ({ ...prev, correction1: text }));
          setPhase("ask-details");
        }
        break;
      }

      case "ask-details": {
        // 連問產業、官網、客群、競品（用 state 追蹤子步驟）
        if (!brandData.industry) {
          setBrandData(prev => ({ ...prev, industry: text }));
          await delay(200);
          addMsg("ai", "了解！品牌官網網址？（選填，可輸入「略過」）");
        } else if (!brandData.websiteUrl) {
          setBrandData(prev => ({ ...prev, websiteUrl: /略過|skip/i.test(text) ? "" : text }));
          await delay(200);
          addMsg("ai", "你的主要目標客群是誰？（例如：25-40 歲的品牌行銷主管）");
        } else if (!brandData.targetAudience) {
          setBrandData(prev => ({ ...prev, targetAudience: text }));
          await delay(200);
          addMsg("ai", "主要競品有哪些？（逗號分隔，可輸入「略過」）");
        } else if (!brandData.competitors) {
          setBrandData(prev => ({ ...prev, competitors: /略過|skip/i.test(text) ? "" : text }));
          setPhase("phase2-strategy");
          await runPhase2();
        }
        break;
      }

      case "confirm-phase2": {
        const lower = text.toLowerCase();
        if (/沒問題|繼續|ok|好的|可以|對|確認/.test(lower)) {
          setPhase("phase3-proposals");
          await runPhase3();
        } else {
          setBrandData(prev => ({ ...prev, correction2: text }));
          addMsg("ai", `好，我記下：「${text}」，更新到方案中。繼續產出最終提案。`);
          setPhase("phase3-proposals");
          await runPhase3();
        }
        break;
      }

      case "done": {
        // 用戶選擇方案 → 完成
        const brandId = phase2Result?.brandId ?? 0;
        addMsg("ai", `✅ 已記錄你的選擇！品牌「${brandData.brandName}」的定位方案已儲存。\n\n正在開啟你的工作區...`);
        await delay(1500);
        onComplete(brandId, brandData.brandName);
        break;
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const completedPhases = messages.filter(m => m.role === "phase-result").length;
  const totalPhases = 3;

  return (
    <div className="min-h-screen bg-white dark:bg-[#212121] flex items-center justify-center px-4">
      <div className="w-full max-w-2xl flex flex-col" style={{ height: "92vh" }}>

        {/* Header */}
        <div className="text-center py-5 shrink-0">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-xs text-neutral-500 dark:text-neutral-400 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"/>
            SoWork AI · 品牌定位分析
          </div>
          <div className="flex gap-1.5 justify-center items-center">
            {Array.from({ length: totalPhases }, (_, i) => (
              <div key={i} className={`rounded-full transition-all duration-500 ${
                i < completedPhases ? "w-8 h-1.5 bg-neutral-800 dark:bg-neutral-200" :
                i === completedPhases && loading ? "w-8 h-1.5 bg-neutral-400 dark:bg-neutral-500 animate-pulse" :
                "w-4 h-1.5 bg-neutral-200 dark:bg-neutral-700"
              }`}/>
            ))}
            <span className="text-xs text-neutral-400 dark:text-neutral-600 ml-2">{completedPhases}/{totalPhases} 完成</span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {messages.map(msg => (
            <div key={msg.id}>
              {/* Agent status indicator */}
              {msg.role === "agent-status" && (
                <div className="flex items-center gap-2 py-1 px-2">
                  <div className="flex items-center gap-2 text-xs text-neutral-400 dark:text-neutral-600">
                    <div className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-pulse"/>
                    <span className="font-medium text-neutral-500 dark:text-neutral-500">{msg.agentName}</span>
                    <span>{msg.agentTitle}</span>
                    <span>·</span>
                    <span>{msg.text}</span>
                  </div>
                </div>
              )}

              {/* Phase result card */}
              {msg.role === "phase-result" && (
                <div className="mx-1 rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
                    <div className="w-5 h-5 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xs font-bold text-neutral-600 dark:text-neutral-400">
                      {msg.agentName?.charAt(0)}
                    </div>
                    <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{msg.agentName}</span>
                    <span className="text-xs text-neutral-400 dark:text-neutral-600">{msg.agentTitle}</span>
                    <span className="ml-auto text-xs text-neutral-400 dark:text-neutral-600">第 {msg.phase} 階段</span>
                  </div>
                  <div className="px-4 py-3 text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap">
                    {msg.text}
                  </div>
                </div>
              )}

              {/* Normal AI / user messages */}
              {(msg.role === "ai" || msg.role === "user") && (
                <div className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "ai" && (
                    <div className="w-8 h-8 rounded-full bg-neutral-800 dark:bg-neutral-200 flex items-center justify-center shrink-0 mt-0.5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" className="dark:stroke-neutral-900" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/>
                      </svg>
                    </div>
                  )}
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-br-md"
                      : "bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 rounded-bl-md"
                  }`} style={{ whiteSpace: "pre-wrap" }}>
                    {msg.text}
                  </div>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-neutral-800 dark:bg-neutral-200 flex items-center justify-center shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" className="dark:stroke-neutral-900" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/>
                </svg>
              </div>
              <div className="bg-neutral-100 dark:bg-neutral-800 rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex gap-1.5 items-center h-5">
                  {[0,150,300].map(d => <span key={d} className="w-2 h-2 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: `${d}ms` }}/>)}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>

        {/* Input */}
        {!loading && (
          <div className="py-4 shrink-0">
            <div className="flex items-end gap-3 bg-neutral-100 dark:bg-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-700 px-4 py-3">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="輸入你的回覆..."
                rows={1}
                autoFocus
                className="flex-1 resize-none bg-transparent text-sm text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-600 outline-none"
                style={{ maxHeight: 120, lineHeight: 1.6 }}
              />
              <button onClick={handleSend} disabled={!input.trim()}
                className="shrink-0 w-9 h-9 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 flex items-center justify-center hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
            <p className="text-xs text-neutral-400 dark:text-neutral-600 text-center mt-2">Enter 送出</p>
          </div>
        )}

      </div>
    </div>
  );
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }
