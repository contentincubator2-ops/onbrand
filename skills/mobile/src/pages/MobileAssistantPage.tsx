/**
 * 幕僚長頁面 - AI 幕僚長主介面
 * 這是用戶與幕僚長對話的主要入口
 *
 * UI 設計規範：
 * - Apple SF Symbols 風格圖標
 * - 品牌色: #E8611A (橘色)
 * - 漸變: 橘色到粉色
 */
import { useState, useRef, useEffect, useCallback } from "react";
import MobileHeader from "../components/MobileHeader";
import { trpc } from "@/lib/trpc";
import { getDemoData } from "../demoData";
import { useI18n } from "@/i18n";
import { generatePositioningBookPPT, generatePositioningBookDOC } from "@/lib/positioningBookExporter";
import { samplePositioningPlan } from "@/lib/samplePositioningPlan";
import { generateXLS, generatePDF, generateHillhousePEXls } from "@/lib/documentGenerator";
import AdPerformanceCard from "../components/AdPerformanceCard";

// 推薦的 AI 員工
interface AgentRecommendation {
  id: number;
  name: string;
  title: string;
  avatar: string | null;
  reason: string;
  role: "primary" | "support";
}

// 建議操作
interface SuggestedAction {
  label: string;
  action: string;
  params?: Record<string, any>;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  recommendations?: AgentRecommendation[];
  suggestedActions?: SuggestedAction[];
}

export default function MobileAssistantPage() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { locale, t, toggleLocale } = useI18n();

  const demoPersonaId = localStorage.getItem("demoPersonaId");
  const demoAssistant = demoPersonaId ? getDemoData(demoPersonaId) : null;

  // 今日 AI 工作摘要資料
  const { data: completedTasks } = trpc.chiefOfStaff.tasks.useQuery(
    { status: "completed" },
    { enabled: !demoPersonaId }
  );
  const completedCount = demoAssistant?.assistantContext.completedToday ?? (completedTasks?.length ?? 0);
  const timeSavedHours = demoAssistant?.assistantContext.timeSavedHours ?? (completedCount * 2);

  // Market Insights state
  const [marketTrends, setMarketTrends] = useState<any[]>([]);
  const [trendsLoading, setTrendsLoading] = useState(true);

  useEffect(() => {
    const baseUrl = window.location.origin.includes("localhost") ? "http://localhost:3001" : "";
    fetch(`${baseUrl}/api/market-data/trends`)
      .then(r => r.json())
      .then(json => {
        setMarketTrends((json.data ?? []).slice(0, 3));
        setTrendsLoading(false);
      })
      .catch(() => setTrendsLoading(false));
  }, []);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: demoAssistant?.assistantContext.welcomeMessage ?? t("assistant.defaultWelcome"),
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState<number[]>([]);

  // tRPC mutation
  const chatMutation = trpc.chiefOfStaff.chat.useMutation();
  const confirmTeamMutation = trpc.chiefOfStaff.confirmTeam.useMutation();

  // 滾動到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 判斷是否為下載類型動作（demo 模式用）
  const getDownloadType = (prompt: string): "ppt" | "excel" | "pdf" | "docx" | null => {
    const p = prompt.toLowerCase();
    if (p.includes("ppt") || p.includes("powerpoint") || p.includes("簡報")) return "ppt";
    if (p.includes("excel") || p.includes("財務") || p.includes("表格")) return "excel";
    if (p.includes("pdf")) return "pdf";
    if (p.includes("word") || p.includes("doc")) return "docx";
    return null;
  };

  // 判斷是否為日曆排程意圖
  const getCalendarIntent = (prompt: string): "schedule" | "email_check" | "email_reply" | null => {
    const p = prompt;
    if (/幫我約|開會|見面|開個會|安排會議|schedule|meeting|appointment/.test(p)) return "schedule";
    if (/郵件|email|mail|未讀|重要信件/.test(p)) return "email_check";
    if (/回覆|reply|回信|幫我回/.test(p)) return "email_reply";
    return null;
  };

  const handleDemoCalendarOrEmail = async (prompt: string): Promise<boolean> => {
    if (!demoPersonaId) return false;
    const intent = getCalendarIntent(prompt);
    if (!intent) return false;

    const calendarProvider = demoAssistant?.calendarProvider ?? "google";
    const meetPlatform = calendarProvider === "microsoft" ? "Teams" : "Google Meet";
    const meetUrl = calendarProvider === "microsoft"
      ? "https://teams.microsoft.com/l/meetup-join/demo123"
      : "https://meet.google.com/abc-defg-hij";

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: prompt, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    if (intent === "schedule") {
      // Step 1: 查詢空檔
      const checkingMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: locale === "zh"
          ? `正在查詢您的行事曆空檔...`
          : "Checking your calendar availability...",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, checkingMsg]);

      await new Promise(r => setTimeout(r, 1200));

      const slotsMsg: Message = {
        id: (Date.now() + 2).toString(),
        role: "assistant",
        content: locale === "zh"
          ? `本週共同空檔：\n• 週三 14:00–16:00 ✓\n• 週四 10:00–12:00 ✓\n\n要預約哪個時間？（回覆「週三」或「週四」）`
          : `Common availability this week:\n• Wednesday 14:00–16:00 ✓\n• Thursday 10:00–12:00 ✓\n\nWhich time works? (Reply "Wed" or "Thu")`,
        timestamp: new Date(),
        suggestedActions: [
          { label: locale === "zh" ? "預約週三 14:00" : "Book Wed 14:00", action: "book_wednesday" },
          { label: locale === "zh" ? "預約週四 10:00" : "Book Thu 10:00", action: "book_thursday" },
        ],
      };
      setMessages(prev => [...prev, slotsMsg]);
    } else if (intent === "email_check") {
      const checkingMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: locale === "zh"
          ? "正在讀取您的重要未讀郵件..."
          : "Reading your important unread emails...",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, checkingMsg]);

      await new Promise(r => setTimeout(r, 1000));

      const emailMsg: Message = {
        id: (Date.now() + 2).toString(),
        role: "assistant",
        content: locale === "zh"
          ? `您有 3 封未讀重要郵件：\n\n📧 1. Nike 客戶 Annie Chen\n主旨：「Re: Q4 策略提案時間確認」\n摘要：詢問本週或下週初進行詳細簡報...\n\n📧 2. 法務部\n主旨：「Unilever 合約需要您的簽名」\n摘要：請於本週五前完成電子簽名...\n\n📧 3. P&G 品牌團隊\n主旨：「Q4 廣告文案反饋」\n摘要：日文版本語氣需調整...\n\n需要我幫您起草哪封的回覆？`
          : `You have 3 important unread emails:\n\n📧 1. Annie Chen (Nike)\nRe: Q4 strategy proposal timing\nSummary: Requesting a detailed presentation this week or early next week...\n\n📧 2. Legal Team\nUnilever contract needs your signature\nSummary: Please complete e-signature by Friday...\n\n📧 3. P&G Brand Team\nQ4 ad copy feedback\nSummary: Japanese version tone adjustment needed...\n\nWould you like me to draft a reply?`,
        timestamp: new Date(),
        suggestedActions: [
          { label: locale === "zh" ? "回覆 Nike Annie" : "Reply to Annie", action: "draft_nike_reply" },
          { label: locale === "zh" ? "稍後處理" : "Handle later", action: "continue" },
        ],
      };
      setMessages(prev => [...prev, emailMsg]);
    } else if (intent === "email_reply") {
      const draftMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: locale === "zh"
          ? `已為您起草回覆：\n\n---\nAnnie，\n\n感謝您的來信。很高興您對 Q4 提案感興趣！建議安排本週四上午 10:00 進行詳細簡報，共 90 分鐘，請確認 James 和 Leo 是否方便。\n\n${meetPlatform} 連結：${meetUrl}\n\n期待與您的團隊交流。\n\n此致\n---\n\n確認後送出？`
          : `Draft reply:\n\n---\nAnnie,\n\nThank you for your message! I'd suggest Thursday 10:00 AM for the detailed presentation (90 mins). Please confirm with James and Leo.\n\n${meetPlatform} link: ${meetUrl}\n\nLooking forward to it.\n\nBest regards\n---\n\nSend this reply?`,
        timestamp: new Date(),
        suggestedActions: [
          { label: locale === "zh" ? "確認送出" : "Confirm & Send", action: "send_email" },
          { label: locale === "zh" ? "修改後送出" : "Edit first", action: "continue" },
        ],
      };
      setMessages(prev => [...prev, draftMsg]);
    }

    setIsLoading(false);
    return true;
  };

  const handleDemoDownload = async (prompt: string, label: string) => {
    const downloadType = getDownloadType(prompt);
    if (!downloadType || !demoPersonaId) return false;

    const companyName = demoAssistant
      ? label.replace(/下載|匯出|報告|PDF|PPT|Excel|Word/g, "").trim() || demoPersonaId
      : demoPersonaId;

    setIsLoading(true);

    // 顯示 AI 正在生成的訊息
    const generatingMsg: Message = {
      id: Date.now().toString(),
      role: "assistant",
      content: locale === "zh"
        ? `正在為您生成 ${downloadType.toUpperCase()} 文件，請稍候...`
        : `Generating ${downloadType.toUpperCase()} file for you, please wait...`,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, generatingMsg]);

    try {
      await new Promise(r => setTimeout(r, 1500)); // 模擬生成時間

      if (downloadType === "ppt") {
        await generatePositioningBookPPT({
          brandName: companyName || "Demo",
          plan: samplePositioningPlan,
          planIndex: 0,
          reportDate: new Date(),
          author: "幕僚長 AI",
        });
      } else if (downloadType === "docx") {
        await generatePositioningBookDOC({
          brandName: companyName || "Demo",
          plan: samplePositioningPlan,
          planIndex: 0,
          reportDate: new Date(),
          author: "幕僚長 AI",
        });
      } else if (downloadType === "excel") {
        if (demoPersonaId === "hillhouse-capital") {
          // PE 級財務 Excel：IRR/TVPI/DPI/MOIC by vintage year
          await generateHillhousePEXls();
        } else {
          await generateXLS({
            title: `${companyName || "Demo"} 財務數據報表`,
            content: "財務數據",
            author: "幕僚長 AI",
            date: new Date(),
            tableData: {
              headers: ["項目", "Q1", "Q2", "Q3", "Q4", "全年合計"],
              rows: [
                ["營業收入", "12.3M", "14.8M", "16.2M", "19.5M", "62.8M"],
                ["毛利率", "42%", "45%", "44%", "48%", "45%"],
                ["EBITDA", "3.2M", "4.1M", "4.6M", "5.8M", "17.7M"],
                ["ROI", "18%", "22%", "24%", "29%", "23%"],
                ["客戶數", "48", "56", "61", "72", "72"],
                ["NPS", "67", "71", "74", "78", "78"],
              ],
            },
          });
        }
      } else if (downloadType === "pdf") {
        await generatePDF({
          title: `${companyName || "Demo"} 分析報告`,
          content: "本報告由 AI 幕僚長自動生成，包含市場分析、競品比較與策略建議。\n\n主要發現：\n1. 市場份額持續增長，同比提升 18%\n2. 競品在短影音領域加大投放，建議調整策略\n3. 三個優先行動方案已標記，請確認後執行",
          author: "幕僚長 AI",
          date: new Date(),
        });
      }

      const doneMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: locale === "zh"
          ? `✅ ${downloadType.toUpperCase()} 文件已生成並下載完成！如需修改版本或其他格式，請告訴我。`
          : `✅ ${downloadType.toUpperCase()} file generated and downloaded! Let me know if you need a different version or format.`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, doneMsg]);
    } catch (err) {
      console.error("Download error:", err);
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: locale === "zh" ? "文件生成失敗，請稍後再試。" : "File generation failed, please try again.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
    }
    return true;
  };

  const handleSend = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || isLoading) return;

    // Demo 模式：先嘗試下載意圖，再嘗試日曆/Email 意圖
    if (demoPersonaId) {
      const downloadType = getDownloadType(messageText);
      if (downloadType) {
        await handleDemoDownload(messageText, messageText);
        return;
      }
      const calHandled = await handleDemoCalendarOrEmail(messageText);
      if (calHandled) return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const history = messages.slice(-6).map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const response = await chatMutation.mutateAsync({
        message: messageText,
        history,
      });

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response.message,
        timestamp: new Date(),
        recommendations: response.recommendations,
        suggestedActions: response.suggestedActions,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      if (response.recommendations) {
        setSelectedAgents(response.recommendations.map(r => r.id));
      }

    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: t("assistant.errorResponse"),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // 處理建議操作
  const handleAction = async (action: SuggestedAction) => {
    if (action.action === "confirm_team" && selectedAgents.length > 0) {
      setIsLoading(true);
      try {
        const userMessages = messages.filter(m => m.role === "user");
        const lastUserMessage = userMessages[userMessages.length - 1]?.content || "";

        const result = await confirmTeamMutation.mutateAsync({
          agentIds: selectedAgents,
          taskTitle: lastUserMessage.slice(0, 30) || (locale === "zh" ? "新任務" : "New Task"),
          taskDescription: lastUserMessage,
        });

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: result.message,
          timestamp: new Date(),
          suggestedActions: [
            { label: locale === "zh" ? "查看任務詳情" : "View Task", action: "view_task", params: { taskId: result.taskId } },
            { label: locale === "zh" ? "繼續對話" : "Continue", action: "continue" },
          ],
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setSelectedAgents([]);
      } catch (error) {
        console.error("Confirm team error:", error);
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: t("assistant.teamError"),
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    } else if (action.action === "view_task" && action.params?.taskId) {
      window.location.href = `/app/tasks/${action.params.taskId}`;
    } else if (action.action === "change_team") {
      handleSend(locale === "zh" ? "請推薦其他人選" : "Please recommend other candidates");
    } else if (action.action === "new_call_summary") {
      handleSend(locale === "zh" ? "我剛打完電話，幫我整理通話重點" : "I just finished a call, help me summarize the key points");
    } else if (action.action === "book_wednesday" || action.action === "book_thursday") {
      const isWed = action.action === "book_wednesday";
      const calendarProvider = demoAssistant?.calendarProvider ?? "google";
      const meetPlatform = calendarProvider === "microsoft" ? "Teams" : "Google Meet";
      const meetUrl = calendarProvider === "microsoft"
        ? "https://teams.microsoft.com/l/meetup-join/demo456"
        : `https://meet.google.com/${Math.random().toString(36).slice(2, 5)}-${Math.random().toString(36).slice(2, 6)}-${Math.random().toString(36).slice(2, 5)}`;
      const timeStr = isWed
        ? (locale === "zh" ? "週三 14:00–16:00" : "Wednesday 14:00–16:00")
        : (locale === "zh" ? "週四 10:00–12:00" : "Thursday 10:00–12:00");
      const confirmMsg: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: locale === "zh"
          ? `✅ 已建立 ${meetPlatform} 會議！\n\n時間：${timeStr}\n${meetPlatform} 連結：${meetUrl}\n\n是否透過 LINE 通知所有參與者？`
          : `✅ ${meetPlatform} meeting created!\n\nTime: ${timeStr}\n${meetPlatform} link: ${meetUrl}\n\nShould I notify all participants via LINE?`,
        timestamp: new Date(),
        suggestedActions: [
          { label: locale === "zh" ? "傳 LINE 通知" : "Send LINE notice", action: "send_line_notice" },
          { label: locale === "zh" ? "不用了" : "No thanks", action: "continue" },
        ],
      };
      setMessages(prev => [...prev, confirmMsg]);
    } else if (action.action === "send_line_notice" || action.action === "draft_nike_reply") {
      const doneMsg: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: action.action === "send_line_notice"
          ? (locale === "zh" ? "✅ LINE 通知已傳送給所有參與者！他們將收到會議時間與連結。" : "✅ LINE notifications sent to all participants!")
          : (locale === "zh" ? "已準備好回覆草稿，需要我幫您調整措辭或直接送出？" : "Draft reply ready. Shall I adjust the wording or send directly?"),
        timestamp: new Date(),
        suggestedActions: action.action === "draft_nike_reply"
          ? [{ label: locale === "zh" ? "直接送出" : "Send now", action: "send_email" }]
          : undefined,
      };
      setMessages(prev => [...prev, doneMsg]);
    } else if (action.action === "send_email") {
      const sentMsg: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: locale === "zh"
          ? "✅ 回覆已成功送出！對方收到後我會通知您。"
          : "✅ Reply sent successfully! I'll notify you when they respond.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, sentMsg]);
    } else if (action.action === "continue") {
      // 不做任何事，讓用戶繼續輸入
    } else {
      handleSend(action.label);
    }
  };

  // 切換選擇 AI 員工
  const toggleAgentSelection = (id: number) => {
    setSelectedAgents(prev =>
      prev.includes(id)
        ? prev.filter(a => a !== id)
        : [...prev, id]
    );
  };

  const defaultQuickActionDefs = [
    { label: t("assistant.quickAction1"), prompt: t("assistant.quickAction1Prompt") },
    { label: t("assistant.quickAction2"), prompt: t("assistant.quickAction2Prompt") },
    { label: t("assistant.quickAction3"), prompt: t("assistant.quickAction3Prompt") },
    { label: t("assistant.quickAction4"), prompt: t("assistant.quickAction4Prompt") },
  ];

  const quickActionDefs = demoAssistant?.assistantContext.quickActions ?? defaultQuickActionDefs;

  const defaultIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3C3C43" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" />
    </svg>
  );

  const quickActions = quickActionDefs.map((qa, i) => ({
    label: qa.label,
    prompt: qa.prompt,
    icon: [
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3C3C43" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" key="0">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>,
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3C3C43" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" key="1">
        <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>,
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3C3C43" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" key="2">
        <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /><path d="M9 16l2 2 4-4" />
      </svg>,
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3C3C43" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" key="3">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.77a16 16 0 0 0 6 6l.86-.86a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 16z" />
      </svg>,
    ][i] ?? defaultIcon,
  }));

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex-shrink-0 bg-white/95 backdrop-blur-lg border-b border-gray-200/60 px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#E8611A] flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5 20c0-3.5 3.5-5.5 7-5.5s7 2 7 5.5" />
              </svg>
            </div>
            <span className="text-base font-medium text-[#1C1C1E]">{t("assistant.title")}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleLocale}
              className="flex items-center justify-center w-8 h-8 bg-gray-100 rounded-full active:bg-gray-200 transition-colors text-base"
              title={locale === "zh" ? "Switch to English" : "切換中文"}
            >
              🌐
            </button>
            <button
              onClick={() => window.location.href = "/app/profile"}
              className="flex items-center justify-center w-8 h-8 bg-gray-100 rounded-full active:bg-gray-200 transition-colors"
              title="個人設定"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
            <button
              onClick={() => window.location.href = "/app/company-settings"}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-100 rounded-lg active:bg-gray-200 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 1.5 17V4.5A2.5 2.5 0 0 1 4 2h8.5L17 6.5V17a2.5 2.5 0 0 1-2.5 2.5H4z" transform="scale(1.2) translate(-1,-1)" />
                <path d="M12 2v5h5" transform="scale(1.2) translate(-1,-1)" />
              </svg>
              <span className="text-xs text-gray-600 font-medium">{t("assistant.knowledgeBase")}</span>
            </button>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-[#34C759]" />
              <span className="text-xs text-[#8E8E93]">{t("assistant.statusOnline")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 今日 AI 工作摘要 */}
      {messages.length <= 1 && (
        <div className="flex-shrink-0 mx-4 mt-4 mb-1 bg-gradient-to-r from-[#1C1C1E] to-[#3A3A3C] rounded-2xl p-4">
          <p className="text-[11px] text-white/50 mb-2 tracking-wide uppercase">{t("assistant.todaySummary")}</p>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <p className="text-2xl font-bold text-white">{completedCount}</p>
              <p className="text-[12px] text-white/60 mt-0.5">{t("assistant.tasksCompleted")}</p>
            </div>
            <div className="w-px h-10 bg-white/20" />
            <div className="flex-1">
              <p className="text-2xl font-bold text-[#34C759]">{timeSavedHours}h</p>
              <p className="text-[12px] text-white/60 mt-0.5">{t("assistant.timeSaved")}</p>
            </div>
            <div className="w-px h-10 bg-white/20" />
            <div className="flex-1 text-right">
              <div className="flex items-center justify-end gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#30D158" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <p className="text-[12px] text-[#30D158] font-medium">Slack</p>
              </div>
              <p className="text-[11px] text-white/40 mt-0.5">{t("assistant.noSlackNeeded")}</p>
            </div>
          </div>
          {completedCount === 0 && (
            <p className="text-[11px] text-white/40 mt-2">{t("assistant.firstTaskPrompt")}</p>
          )}
        </div>
      )}

      {/* 快速操作區 */}
      {messages.length <= 1 && (
        <div className="flex-shrink-0 px-4 py-5">
          <p className="text-xs text-[#8E8E93] mb-3 tracking-wide">{t("assistant.quickStart")}</p>
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={async () => {
                  if (demoPersonaId) {
                    const calHandled = await handleDemoCalendarOrEmail(action.prompt);
                    if (calHandled) return;
                    const handled = await handleDemoDownload(action.prompt, action.label);
                    if (!handled) handleSend(action.prompt);
                  } else {
                    handleSend(action.prompt);
                  }
                }}
                className="flex items-center gap-3 bg-[#F2F2F7] rounded-xl px-4 py-3.5 active:bg-[#E5E5EA] transition-colors"
              >
                <div className="flex-shrink-0">{action.icon}</div>
                <span className="text-sm font-medium text-[#1C1C1E]">{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 最近記錄區塊 */}
      {messages.length <= 1 && demoAssistant?.assistantContext.recentConversations && (
        <div className="flex-shrink-0 px-4 pb-4">
          <p className="text-xs text-[#8E8E93] mb-3 tracking-wide">
            {locale === "zh" ? "最近記錄" : "Recent Activity"}
          </p>
          <div className="space-y-2.5">
            {demoAssistant.assistantContext.recentConversations.map((conv, idx) => (
              <div key={idx} className={`flex gap-2.5 ${conv.role === "user" ? "justify-end" : "justify-start"}`}>
                {conv.role === "assistant" && (
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#1C1C2E] flex items-center justify-center">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                      <circle cx="12" cy="8" r="3.5" />
                      <path d="M5 20c0-3.5 3.5-5.5 7-5.5s7 2 7 5.5" />
                    </svg>
                  </div>
                )}
                <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 ${
                  conv.role === "user"
                    ? "bg-[#007AFF] rounded-br-sm"
                    : "bg-[#F0F0F5] rounded-bl-sm"
                }`}>
                  <p className={`text-[14px] leading-snug ${conv.role === "user" ? "text-white" : "text-[#1C1C1E]"}`}>
                    {conv.message}
                  </p>
                  <p className={`text-[10px] mt-1 ${conv.role === "user" ? "text-white/60" : "text-[#8E8E93]"}`}>
                    {conv.time}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Spark Agency 廣告儀表板 */}
      {messages.length <= 1 && demoPersonaId === "single-market-agency" && (
        <AdPerformanceCard />
      )}

      {/* 市場即時洞察 */}
      {messages.length <= 1 && (
        <div className="flex-shrink-0 px-4 pb-4">
          <p className="text-xs text-[#8E8E93] mb-3 tracking-wide">
            {locale === "zh" ? "📊 市場即時洞察" : "📊 Market Insights"}
          </p>
          <div className="space-y-2">
            {trendsLoading ? (
              [0, 1, 2].map(i => (
                <div key={i} className="bg-[#F2F2F7] rounded-xl px-4 py-3 animate-pulse">
                  <div className="h-3 bg-gray-300 rounded w-3/4 mb-2" />
                  <div className="h-2.5 bg-gray-200 rounded w-1/2" />
                </div>
              ))
            ) : marketTrends.length > 0 ? (
              marketTrends.map((trend, idx) => {
                const topic = trend.topic ?? trend.title ?? `Trend ${idx + 1}`;
                const summary = trend.summary ?? trend.description ?? "";
                const platform = trend.platform ?? "";
                return (
                  <button
                    key={idx}
                    onClick={() => handleSend(locale === "zh" ? `告訴我更多關於：${topic}` : `Tell me more about: ${topic}`)}
                    className="w-full text-left bg-[#F2F2F7] rounded-xl px-4 py-3 active:bg-[#E5E5EA] transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-base">{["🔥", "📈", "💡"][idx]}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#1C1C1E] truncate">{topic}</p>
                        {summary && (
                          <p className="text-xs text-[#8E8E93] mt-0.5 line-clamp-1">{summary}</p>
                        )}
                        {platform && (
                          <p className="text-[10px] text-[#8E8E93] mt-0.5">{platform}</p>
                        )}
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C7C7CC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-1">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </div>
                  </button>
                );
              })
            ) : (
              <p className="text-xs text-[#8E8E93] text-center py-2">
                {locale === "zh" ? "暫無市場數據" : "No market data available"}
              </p>
            )}
          </div>
        </div>
      )}

      {/* 私募基金市場動態 — Hillhouse 專屬 */}
      {messages.length <= 1 && demoPersonaId === "hillhouse-capital" && (
        <div className="flex-shrink-0 px-4 pb-4">
          <p className="text-xs text-[#8E8E93] mb-3 tracking-wide">
            💼 私募基金市場動態
          </p>
          <div className="space-y-2">
            {[
              {
                icon: "📊",
                topic: "亞洲 PE IRR 維持 18.2%",
                summary: "亞洲 PE 2024 Q4 平均 IRR 維持 18.2%，科技板塊溢價明顯",
                source: "Source: Preqin 2024 Q4 Report",
              },
              {
                icon: "💧",
                topic: "DPI > 1.0x 基金比例上升至 34%",
                summary: "LP 對 Liquidity 期望提升，流動性壓力推動更積極退出決策",
                source: "Source: Preqin 2024 Q4 Report",
              },
              {
                icon: "🎯",
                topic: "2024 Vintage 入場估值回調 25–30%",
                summary: "建倉窗口開啟，頭部 GP 已加快新基金部署節奏",
                source: "Source: Preqin 2024 Q4 Report",
              },
            ].map((item, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(`告訴我更多：${item.topic}`)}
                className="w-full text-left bg-[#F2F2F7] rounded-xl px-4 py-3 active:bg-[#E5E5EA] transition-colors"
              >
                <div className="flex items-start gap-2">
                  <span className="text-base">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#1C1C1E] truncate">{item.topic}</p>
                    <p className="text-xs text-[#8E8E93] mt-0.5 line-clamp-1">{item.summary}</p>
                    <p className="text-[10px] text-[#A0A0A8] mt-0.5">{item.source}</p>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C7C7CC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-1">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 對話區域 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg) => (
          <div key={msg.id} className="space-y-2">
            <div className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#E8611A] flex items-center justify-center">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                    <circle cx="12" cy="8" r="3.5" />
                    <path d="M5 20c0-3.5 3.5-5.5 7-5.5s7 2 7 5.5" />
                  </svg>
                </div>
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 ${
                  msg.role === "user"
                    ? "bg-[#007AFF] rounded-br-sm"
                    : "bg-[#E9E9EB] rounded-bl-sm"
                }`}
              >
                <p className={`text-[15px] whitespace-pre-wrap leading-snug ${
                  msg.role === "user" ? "text-white" : "text-[#1C1C1E]"
                }`}>{msg.content}</p>
                <p
                  className={`text-[10px] mt-1.5 ${
                    msg.role === "user" ? "text-white/60" : "text-[#8E8E93]"
                  }`}
                >
                  {msg.timestamp.toLocaleTimeString(locale === "zh" ? "zh-TW" : "en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>

            {/* AI 員工推薦卡片 */}
            {msg.recommendations && msg.recommendations.length > 0 && (
              <div className="ml-9 space-y-2">
                <p className="text-xs text-[#8E8E93] flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8E8E93" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                  </svg>
                  {t("assistant.recommendedTeam")}
                </p>
                {msg.recommendations.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => toggleAgentSelection(agent.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                      selectedAgents.includes(agent.id)
                        ? "bg-[#E8611A] text-white"
                        : "bg-[#F2F2F7] text-[#1C1C1E]"
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-base font-medium bg-white/20 overflow-hidden">
                      {agent.avatar ? (
                        <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className={selectedAgents.includes(agent.id) ? "text-white" : "text-[#3C3C43]"}>
                          {agent.name.charAt(0)}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-sm truncate">{agent.name}</span>
                        {agent.role === "primary" && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            selectedAgents.includes(agent.id)
                              ? "bg-white/20 text-white"
                              : "bg-[#E8611A]/10 text-[#E8611A]"
                          }`}>
                            {t("assistant.primaryTag")}
                          </span>
                        )}
                      </div>
                      <p className={`text-xs truncate ${selectedAgents.includes(agent.id) ? "text-white/80" : "text-[#8E8E93]"}`}>
                        {agent.title}
                      </p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                      selectedAgents.includes(agent.id)
                        ? "border-white bg-white"
                        : "border-[#C7C7CC]"
                    }`}>
                      {selectedAgents.includes(agent.id) && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#E8611A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* 建議操作按鈕 */}
            {msg.suggestedActions && msg.suggestedActions.length > 0 && (
              <div className="ml-9 flex flex-wrap gap-2">
                {msg.suggestedActions.map((action, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAction(action)}
                    className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      action.action === "confirm_team"
                        ? "bg-[#E8611A] text-white"
                        : "bg-[#F2F2F7] text-[#007AFF]"
                    }`}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Loading 動畫 */}
        {isLoading && (
          <div className="flex gap-2.5 justify-start">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#E8611A] flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5 20c0-3.5 3.5-5.5 7-5.5s7 2 7 5.5" />
              </svg>
            </div>
            <div className="bg-[#E9E9EB] rounded-2xl rounded-bl-sm px-3.5 py-2.5">
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-[#8E8E93] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-1.5 h-1.5 bg-[#8E8E93] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-1.5 h-1.5 bg-[#8E8E93] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 輸入區域 */}
      <div className="flex-shrink-0 px-4 py-3 bg-white border-t border-[#C6C6C8]">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={t("assistant.messagePlaceholder")}
            className="flex-1 px-4 py-2 bg-[#F2F2F7] rounded-full text-[15px] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 placeholder:text-[#8E8E93]"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            className="w-8 h-8 flex items-center justify-center bg-[#007AFF] text-white rounded-full disabled:bg-[#C7C7CC] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
