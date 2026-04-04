/**
 * OnboardingWizard — SoWork AI 品牌定位 Onboarding
 * 全對話式，AI 引導，完成後儲存品牌定位資料
 */
import { useState } from "react";
import { trpc } from "../lib/trpc";

interface OnboardingProps {
  onComplete: (brandId: number, brandName: string) => void;
}

interface Step {
  key: string;
  question: string;
  placeholder: string;
  required: boolean;
}

const STEPS: Step[] = [
  { key: "brandName",    question: "你的品牌或公司叫什麼名字？",                          placeholder: "例如：SoWork AI",              required: true },
  { key: "industry",     question: "你們屬於哪個產業或類別？",                             placeholder: "例如：AI 軟體、電商、美妝、食品", required: false },
  { key: "websiteUrl",   question: "品牌官網網址？（選填，AI 會自動分析）",                 placeholder: "https://www.example.com",      required: false },
  { key: "targetAudience", question: "你的主要目標客群是誰？",                            placeholder: "例如：25-40 歲的品牌行銷主管",   required: false },
  { key: "competitors",  question: "你知道的主要競品是哪些？（用逗號分隔，可跳過）",        placeholder: "例如：競品A、競品B、競品C",     required: false },
  { key: "existingPositioning", question: "目前你們怎麼介紹自己的品牌？（有的話貼上來）", placeholder: "例如：我們是...的平台",           required: false },
];

export default function OnboardingWizard({ onComplete }: OnboardingProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");
  const [chatLog, setChatLog] = useState<{ role: "ai" | "user"; text: string }[]>([
    { role: "ai", text: "嗨！我是 SoWork AI，你的策略行銷夥伴。\n\n在開始之前，我需要了解你的品牌，幫你建立完整的品牌定位分析。這只需要幾分鐘。\n\n準備好了嗎？讓我們開始吧 👇" },
    { role: "ai", text: STEPS[0].question },
  ]);
  const [analyzing, setAnalyzing] = useState(false);
  const [done, setDone] = useState(false);

  const runOnboarding = trpc.brand.runOnboarding.useMutation();

  const currentStep = STEPS[stepIdx];

  const handleNext = async () => {
    const val = input.trim();
    if (!val && currentStep.required) return;

    // 加入用戶回答
    const newAnswers = { ...answers, [currentStep.key]: val };
    setAnswers(newAnswers);
    setChatLog(prev => [...prev, { role: "user", text: val || "（略過）" }]);
    setInput("");

    const nextIdx = stepIdx + 1;

    if (nextIdx < STEPS.length) {
      setStepIdx(nextIdx);
      // AI 回應 + 下一題
      const responses: Record<string, string> = {
        brandName: `很好！${val} 聽起來很有潛力。`,
        industry: `了解，${val || "這個領域"}市場很有趣。`,
        websiteUrl: val ? "好的，我等下會參考你的官網資訊。" : "沒關係，我們繼續吧。",
        targetAudience: val ? `${val} 這個族群很清楚，很好。` : "沒關係，我們先繼續。",
        competitors: val ? `了解這些競品，我在分析時會特別比較。` : "沒關係，我自行分析。",
      };
      const ack = responses[currentStep.key] ?? "";
      const nextQ = STEPS[nextIdx].question;
      setChatLog(prev => [...prev, { role: "ai", text: (ack ? ack + "\n\n" : "") + nextQ }]);
    } else {
      // 最後一題完成，開始分析
      setStepIdx(STEPS.length);
      setAnalyzing(true);
      setChatLog(prev => [...prev,
        { role: "ai", text: "太好了！我現在開始為你的品牌進行完整定位分析，這需要約 30 秒..." }
      ]);

      try {
        const competitors = newAnswers.competitors
          ? newAnswers.competitors.split(/[,，、]/).map(s => s.trim()).filter(Boolean)
          : [];

        const result = await runOnboarding.mutateAsync({
          brandName: newAnswers.brandName,
          industry: newAnswers.industry || undefined,
          websiteUrl: newAnswers.websiteUrl || undefined,
          targetAudience: newAnswers.targetAudience || undefined,
          competitors,
          existingPositioning: newAnswers.existingPositioning || undefined,
        });

        const a = result.analysis;
        setChatLog(prev => [...prev,
          { role: "ai", text: `✅ 品牌定位分析完成！\n\n**品牌定位一句話：**\n${a.positioning}\n\n**核心價值主張：**\n${a.valueProposition}\n\n**目標受眾：**\n${a.targetAudience}\n\n**品牌語調：**\n${a.brandVoice}\n\n**差異化優勢：**\n${a.differentiators?.map((d, i) => `${i+1}. ${d}`).join('\n') ?? ''}\n\n這份定位資料已儲存，之後所有任務都會以此為基礎。` }
        ]);
        setDone(true);
        setAnalyzing(false);

        // 2 秒後進入主介面
        setTimeout(() => {
          onComplete(result.brandId ?? 0, newAnswers.brandName);
        }, 2500);
      } catch (err: any) {
        setChatLog(prev => [...prev,
          { role: "ai", text: `分析時發生錯誤：${err?.message ?? "請稍後再試"}` }
        ]);
        setAnalyzing(false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleNext(); }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#212121] flex items-center justify-center px-4">
      <div className="w-full max-w-2xl flex flex-col" style={{ height: "90vh" }}>

        {/* Header */}
        <div className="text-center py-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-xs text-neutral-500 dark:text-neutral-400 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"/>
            SoWork AI · 品牌定位分析
          </div>
          <div className="flex gap-1.5 justify-center">
            {STEPS.map((_, i) => (
              <div key={i} className={`h-1 rounded-full transition-all duration-300 ${
                i < stepIdx ? "w-6 bg-neutral-800 dark:bg-neutral-200" :
                i === stepIdx ? "w-8 bg-neutral-600 dark:bg-neutral-400" :
                "w-4 bg-neutral-200 dark:bg-neutral-700"
              }`}/>
            ))}
          </div>
        </div>

        {/* Chat log */}
        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {chatLog.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
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
          ))}
          {analyzing && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-neutral-800 dark:bg-neutral-200 flex items-center justify-center shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" className="dark:stroke-neutral-900" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/>
                </svg>
              </div>
              <div className="bg-neutral-100 dark:bg-neutral-800 rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex gap-1.5 items-center h-5">
                  {[0,150,300].map(d => (
                    <span key={d} className="w-2 h-2 rounded-full bg-neutral-400 dark:bg-neutral-500 animate-bounce" style={{ animationDelay: `${d}ms` }}/>
                  ))}
                </div>
              </div>
            </div>
          )}
          {done && (
            <div className="text-center py-4">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-100 dark:bg-neutral-800 text-sm text-neutral-600 dark:text-neutral-400">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                正在進入工作區...
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        {!analyzing && !done && stepIdx < STEPS.length && (
          <div className="py-4">
            <div className="flex items-end gap-3 bg-neutral-100 dark:bg-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-700 px-4 py-3">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={currentStep.placeholder}
                rows={1}
                autoFocus
                className="flex-1 resize-none bg-transparent text-sm text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-600 outline-none"
                style={{ maxHeight: 120, lineHeight: 1.6 }}
              />
              <button
                onClick={handleNext}
                disabled={currentStep.required && !input.trim()}
                className="shrink-0 w-9 h-9 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 flex items-center justify-center hover:bg-neutral-700 dark:hover:bg-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
            {!currentStep.required && (
              <p className="text-xs text-neutral-400 dark:text-neutral-600 text-center mt-2">
                這題可以跳過，直接按 Enter
              </p>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
