/**
 * OnboardingWizard v3 — 真實 sowork_db Agent 匹配 + A2A 展示
 */
import { useState, useRef, useEffect } from "react";
import { trpc } from "../lib/trpc";

interface OnboardingProps {
  onComplete: (brandId: number, brandName: string) => void;
}

type MsgRole = "user" | "ai" | "agent-status" | "agent-card" | "phase-result";

interface Msg {
  id: string;
  role: MsgRole;
  text: string;
  agent?: { id: number; name: string; title: string; specialty: string; taskType: string };
  phase?: number;
}

type Phase =
  | "ask-name"
  | "matching-agents"
  | "phase1-research"
  | "confirm-phase1"
  | "ask-details-industry"
  | "ask-details-website"
  | "ask-details-audience"
  | "ask-details-competitors"
  | "phase2-strategy"
  | "confirm-phase2"
  | "phase3-proposals"
  | "done";

export default function OnboardingWizard({ onComplete }: OnboardingProps) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [phase, setPhase] = useState<Phase>("ask-name");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [brandData, setBrandData] = useState<Record<string, string>>({});
  const [matchedAgents, setMatchedAgents] = useState<any[]>([]);
  const [phase1Result, setPhase1Result] = useState<any>(null);
  const [phase2Result, setPhase2Result] = useState<any>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const matchAgents = trpc.brand.matchAgentsForOnboarding.useMutation();
  const analyzeBrand = trpc.brand.analyzeBrand.useMutation();
  const runOnboarding = trpc.brand.runOnboarding.useMutation();

  useEffect(() => {
    addMsg("ai", "嗨！我是 SoWork AI PM。\n\n我會從我們的行銷 Agent 團隊中，即時為你的品牌匹配最適合的成員，帶你完成品牌定位分析。\n\n先告訴我，你的品牌叫什麼名字？");
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, loading]);

  const addMsg = (role: MsgRole, text: string, extra?: Partial<Msg>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setMessages(prev => [...prev, { id, role, text, ...extra }]);
  };

  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

  /* ── Phase 1：品牌名 → 匹配 agents → 第一階段研究 ── */
  const runPhase1 = async (name: string) => {
    setLoading(true);
    setPhase("matching-agents");

    // 展示 Agent 配對過程
    addMsg("agent-status", "正在從 SoWork 行銷人才庫搜尋最適合的 Agent...");
    await delay(800);

    let agents: any[] = [];
    try {
      agents = await matchAgents.mutateAsync({
        brandName: name,
        taskTypes: ["research", "strategy", "copywriting"],
      });
      setMatchedAgents(agents);
    } catch {
      // fallback
      agents = [
        { id: 29, name: "蘇雅玲", title: "公關策略師（SaaS）", specialty: "新聞稿、媒體策略、品牌公關", taskType: "research" },
        { id: 26, name: "吳佳穎", title: "META 廣告策略師", specialty: "Facebook/Instagram 廣告、受眾策略", taskType: "strategy" },
        { id: 32, name: "許雅芳", title: "文案撰寫師", specialty: "廣告文案、社群貼文、Landing Page", taskType: "copywriting" },
      ];
      setMatchedAgents(agents);
    }

    // 逐一展示配對到的 agents
    const taskLabels: Record<string, string> = {
      research: "第一階段：市場研究",
      strategy: "第二階段：品牌策略",
      copywriting: "第三階段：定位提案",
    };

    for (const agent of agents) {
      await delay(400);
      addMsg("agent-card", `配對成功`, { agent: { ...agent }, phase: undefined });
    }

    await delay(500);
    addMsg("ai", `已為「${name}」配對完成研究團隊。\n\n由 **${agents[0]?.name ?? "研究員"}** 先展開第一階段市場調查...`);
    await delay(600);

    // 第一階段分析
    setPhase("phase1-research");
    const researcher = agents[0];
    addMsg("agent-status", `正在搜尋「${name}」的市場定位、競品分析、目標受眾...`, { agent: researcher });

    try {
      const result = await analyzeBrand.mutateAsync({
        brandName: name,
        contentLanguage: "zh-TW",
        competitors: [],
      });
      setPhase1Result(result);

      addMsg("phase-result",
        `**第一階段：初步市場研究** ✓\n\n**初步定位：**\n${result.positioning}\n\n**推測目標受眾：**\n${result.targetAudience}\n\n**差異化方向：**\n${result.differentiators?.slice(0, 3).map((d: string, i: number) => `${i + 1}. ${d}`).join('\n') ?? '—'}`,
        { agent: researcher, phase: 1 }
      );

      await delay(300);
      addMsg("ai", "這是第一階段的初步研究。你覺得方向對嗎？有什麼想補充或修正的？\n\n（輸入「繼續」或告訴我需要調整的地方）");
      setPhase("confirm-phase1");
    } catch (err: any) {
      addMsg("ai", `研究遇到問題：${err?.message}。我繼續問你幾個問題。\n\n你們屬於哪個產業？`);
      setPhase("ask-details-industry");
    }

    setLoading(false);
  };

  /* ── Phase 2：收集更多資訊 → 策略師深度分析 ── */
  const runPhase2 = async (data: Record<string, string>) => {
    setLoading(true);
    setPhase("phase2-strategy");

    const strategist = matchedAgents[1] ?? { name: "策略師", title: "品牌策略師" };
    addMsg("agent-status", "接手第一階段成果，正在進行完整品牌定位分析...", { agent: strategist });
    await delay(800);

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
        `**第二階段：完整品牌策略** ✓\n\n**品牌定位：**\n${result.analysis.positioning}\n\n**核心價值主張：**\n${result.analysis.valueProposition}\n\n**品牌語調：**\n${result.analysis.brandVoice}\n\n**溝通支柱：**\n${result.analysis.messagingPillars?.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n') ?? '—'}`,
        { agent: strategist, phase: 2 }
      );

      await delay(400);
      addMsg("ai", "第二階段完成！確認後，文案師會產出兩種完整定位方案。\n\n（輸入「繼續」或告訴我需要調整）");
      setPhase("confirm-phase2");
    } catch (err: any) {
      addMsg("ai", `分析發生錯誤：${err?.message}`);
    }

    setLoading(false);
  };

  /* ── Phase 3：文案師輸出兩種方案 ── */
  const runPhase3 = async () => {
    setLoading(true);
    setPhase("phase3-proposals");

    const copywriter = matchedAgents[2] ?? { name: "文案師", title: "文案撰寫師" };
    const analysis = phase2Result?.analysis ?? phase1Result;

    addMsg("agent-status", "整合定位策略，撰寫兩種完整品牌定位方案...", { agent: copywriter });
    await delay(1000);

    const posLine = analysis?.positioning ?? brandData.brandName;
    const targetLine = analysis?.targetAudience ?? "目標受眾";
    const diff1 = analysis?.differentiators?.[0] ?? "專業可信賴";

    addMsg("phase-result", [
      `**第三階段：兩種品牌定位提案** ✓`,
      ``,
      `**方案 A：理性專業型**`,
      `定位語：「${posLine}」`,
      `個性：專業、數據導向、可信賴`,
      `訴求：用 AI 讓品牌決策更有依據`,
      `渠道：LinkedIn、B2B 媒體、白皮書`,
      `Tagline：「${diff1}」`,
      ``,
      `---`,
      ``,
      `**方案 B：感性故事型**`,
      `定位語：「為${targetLine.slice(0, 12)}而生的行銷夥伴」`,
      `個性：親切、有溫度、創意驅動`,
      `訴求：理解行銷人的掙扎，讓創意落地`,
      `渠道：Instagram、Facebook、口碑行銷`,
      `Tagline：「${analysis?.valueProposition?.slice(0, 20) ?? "讓每個品牌都被看見"}」`,
    ].join('\n'), { agent: copywriter, phase: 3 });

    await delay(500);
    addMsg("ai", "兩種方案完成！你偏好哪個方向？（A / B，或告訴我融合哪些元素）\n\n確認後，你的品牌定位就會儲存，馬上進入工作區。");
    setPhase("done");
    setLoading(false);
  };

  /* ── 主要 input handler ── */
  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    addMsg("user", text);

    switch (phase) {
      case "ask-name":
        setBrandData(prev => ({ ...prev, brandName: text }));
        await runPhase1(text);
        break;

      case "confirm-phase1": {
        const ok = /繼續|沒問題|ok|好|可以|對|正確/i.test(text);
        const wantChange = /不要|重新|修改|換|不對|錯了|重來/i.test(text);
        if (wantChange) {
          addMsg("ai", "好，你覺得哪個部分需要調整？告訴我你的想法，我請研究員修正。");
          setBrandData({ ...brandData, correction1: text });
          break;
        }
        const newData = { ...brandData };
        if (!ok) newData.correction1 = text;
        setBrandData(newData);
        addMsg("ai", "好，接下來補充幾個資訊讓分析更精準。\n\n你們屬於哪個產業？（例如：AI 軟體、電商、美妝）");
        setPhase("ask-details-industry");
        break;
      }

      case "ask-details-industry":
        setBrandData(prev => ({ ...prev, industry: text }));
        addMsg("ai", "品牌官網？（選填，輸入「略過」也可以）");
        setPhase("ask-details-website");
        break;

      case "ask-details-website": {
        const url = /略過|skip/i.test(text) ? "" : text;
        setBrandData(prev => ({ ...prev, websiteUrl: url }));
        addMsg("ai", "主要目標客群是誰？");
        setPhase("ask-details-audience");
        break;
      }

      case "ask-details-audience":
        setBrandData(prev => ({ ...prev, targetAudience: text }));
        addMsg("ai", "主要競品有哪些？（逗號分隔，可輸入「略過」）");
        setPhase("ask-details-competitors");
        break;

      case "ask-details-competitors": {
        const competitors = /略過|skip/i.test(text) ? "" : text;
        const finalData = { ...brandData, competitors };
        setBrandData(finalData);
        await runPhase2(finalData);
        break;
      }

      case "confirm-phase2": {
        const ok = /繼續|沒問題|ok|好|可以|確認/i.test(text);
        const wantChange = /不要|重新|修改|換|不對|錯了|重來/i.test(text);
        if (wantChange) {
          addMsg("ai", "好，你想調整什麼方向？（例如：更強調 AI 技術、更聚焦電商、換目標受眾）");
          setBrandData(prev => ({ ...prev, correction2: text }));
          break;
        }
        if (!ok) setBrandData(prev => ({ ...prev, correction2: text }));
        await runPhase3();
        break;
      }

      case "done": {
        const lower = text.toLowerCase();
        const chooseA = /^a$|方案.?a|理性|選a|a方案/i.test(text);
        const chooseB = /^b$|方案.?b|感性|選b|b方案/i.test(text);
        const wantChange = /不要|修改|重新|換|再想|不對|改/i.test(text);
        const wantMix = /融合|結合|混|兩個都/i.test(text);

        if (wantChange) {
          addMsg("ai", "好，我們重新來過。你希望方向改成什麼感覺？（例如：更有科技感、更親切、更國際化）");
          setPhase("confirm-phase2");
          break;
        }

        if (wantMix) {
          addMsg("ai", `融合方案：結合 A 的專業可信賴 + B 的有溫度語調。

Tagline：「用 AI 讓每個品牌被看見」

這樣可以嗎？（輸入「確定」儲存）`);
          break;
        }

        if (chooseA || chooseB || /確定|可以|好|ok/i.test(text)) {
          const selected = chooseB ? "B" : "A";
          const brandId = phase2Result?.brandId ?? 0;
          addMsg("ai", `✅ 方案 ${selected} 確認！正在開啟「${brandData.brandName}」的行銷工作區...`);
          setTimeout(() => onComplete(brandId, brandData.brandName), 1500);
        } else {
          addMsg("ai", "請告訴我你選哪個方案（輸入「A」或「B」），或告訴我想調整什麼。");
        }
        break;
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const completedPhases = messages.filter(m => m.role === "phase-result").length;

  return (
    <div className="min-h-screen bg-white dark:bg-[#212121] flex items-center justify-center px-4">
      <div className="w-full max-w-2xl flex flex-col" style={{ height: "92vh" }}>

        {/* Progress header */}
        <div className="text-center py-4 shrink-0">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-xs text-neutral-500 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"/>
            SoWork AI · A2A 品牌定位分析
          </div>
          <div className="flex gap-1.5 justify-center items-center">
            {[0, 1, 2].map(i => (
              <div key={i} className={`rounded-full transition-all duration-500 h-1.5 ${
                i < completedPhases ? "w-8 bg-neutral-800 dark:bg-neutral-200" :
                i === completedPhases && loading ? "w-8 bg-neutral-400 animate-pulse" :
                "w-4 bg-neutral-200 dark:bg-neutral-700"
              }`}/>
            ))}
            <span className="text-xs text-neutral-400 ml-2">{completedPhases}/3</span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-3 py-2 px-1">
          {messages.map(msg => (
            <div key={msg.id}>

              {/* Agent status line */}
              {msg.role === "agent-status" && (
                <div className="flex items-center gap-2 py-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-pulse shrink-0"/>
                  <span className="text-xs text-neutral-400 dark:text-neutral-600">
                    {msg.agent && <span className="font-medium text-neutral-500 dark:text-neutral-500">{msg.agent.name} · </span>}
                    {msg.text}
                  </span>
                </div>
              )}

              {/* Agent card (配對結果) */}
              {msg.role === "agent-card" && msg.agent && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
                  <div className="w-9 h-9 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-sm font-bold text-neutral-600 dark:text-neutral-300 shrink-0">
                    {msg.agent.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">{msg.agent.name}</span>
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">{msg.agent.title}</span>
                    </div>
                    <p className="text-xs text-neutral-400 dark:text-neutral-600 truncate mt-0.5">{msg.agent.specialty}</p>
                  </div>
                  <div className="shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400`}>
                      {{research:"市場研究",strategy:"品牌策略",copywriting:"定位提案",ads:"廣告",seo:"SEO",pr:"公關"}[msg.agent.taskType] ?? msg.agent.taskType}
                    </span>
                  </div>
                </div>
              )}

              {/* Phase result card */}
              {msg.role === "phase-result" && (
                <div className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
                    {msg.agent && (
                      <>
                        <div className="w-6 h-6 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xs font-bold text-neutral-600">
                          {msg.agent.name.charAt(0)}
                        </div>
                        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{msg.agent.name}</span>
                        <span className="text-xs text-neutral-400">·</span>
                        <span className="text-xs text-neutral-400">{msg.agent.title}</span>
                      </>
                    )}
                    <span className="ml-auto text-xs text-green-600 dark:text-green-500 flex items-center gap-1">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      第 {msg.phase} 階段完成
                    </span>
                  </div>
                  <div className="px-4 py-3 text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap">
                    {msg.text}
                  </div>
                </div>
              )}

              {/* Normal messages */}
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
                  {[0,150,300].map(d=><span key={d} className="w-2 h-2 rounded-full bg-neutral-400 animate-bounce" style={{animationDelay:`${d}ms`}}/>)}
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
                onChange={e=>setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="輸入你的回覆..."
                rows={1}
                autoFocus
                className="flex-1 resize-none bg-transparent text-sm text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 outline-none"
                style={{maxHeight:120,lineHeight:1.6}}
              />
              <button onClick={handleSend} disabled={!input.trim()}
                className="shrink-0 w-9 h-9 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 flex items-center justify-center hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
            <p className="text-xs text-neutral-400 text-center mt-2">Enter 送出</p>
          </div>
        )}
      </div>
    </div>
  );
}
