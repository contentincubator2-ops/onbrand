/**
 * StrategyConsultantPage — 策略顧問
 *
 * 4-step flow on a single page:
 *   Step 1: Choose one of 5 scenario cards
 *   Step 2: Choose methodology (pills, per scenario)
 *   Step 3: Choose a consultant (agent grid)
 *   Step 4: Session — initial McKinsey report + live Q&A
 *
 * Route: /consultant
 */
import React, { useRef, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import {
  Button, Card, CardBody, CardHeader, Chip, Divider,
  ScrollShadow, Skeleton, Spinner, Textarea,
} from "@heroui/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AgentAvatar } from "../components/AgentAvatar";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft, faArrowRight, faBrain, faBuilding, faChartPie,
  faDollarSign, faBullhorn, faNetworkWired,
  faPaperPlane, faCheck, faRotateRight, faUser,
} from "@fortawesome/free-solid-svg-icons";

// ─── Types ─────────────────────────────────────────────────────────────────

type Scenario = "business" | "audience" | "pricing" | "promotion" | "channel";

interface ScenarioConfig {
  id: Scenario;
  icon: React.ReactNode;
  label: string;
  description: string;
  color: string;
  methodologies: { key: string; label: string; sublabel: string }[];
}

interface MsgBubble {
  role: "user" | "assistant";
  content: string;
  agentName?: string;
}

// ─── Scenario data ──────────────────────────────────────────────────────────

const SCENARIOS: ScenarioConfig[] = [
  {
    id: "business",
    icon: <FontAwesomeIcon icon={faBuilding} className="text-2xl" />,
    label: "商業策略",
    description: "競爭格局、市場定位與成長路徑",
    color: "bg-blue-50 border-blue-200 text-blue-700",
    methodologies: [
      { key: "blue-ocean",  label: "藍海策略",    sublabel: "消除·降低·提升·創造" },
      { key: "five-forces", label: "五力分析",    sublabel: "Porter 競爭強度分析" },
      { key: "swot",        label: "SWOT 交叉分析",sublabel: "SO / ST / WO / WT 策略" },
      { key: "bcg",         label: "BCG 矩陣",    sublabel: "資源配置優先序" },
      { key: "ansoff",      label: "Ansoff 成長矩陣",sublabel: "四象限成長路徑" },
      { key: "value-chain", label: "價值鏈分析",  sublabel: "Porter 競爭優勢來源" },
      { key: "moat",        label: "競爭護城河",  sublabel: "Morningstar 5種護城河" },
    ],
  },
  {
    id: "audience",
    icon: <FontAwesomeIcon icon={faChartPie} className="text-2xl" />,
    label: "受眾洞察",
    description: "目標客群、需求挖掘與人心地圖",
    color: "bg-purple-50 border-purple-200 text-purple-700",
    methodologies: [
      { key: "stp",     label: "STP 定位策略",  sublabel: "細分·目標·定位三步走" },
      { key: "persona", label: "顧客 Persona",  sublabel: "深度用戶畫像建立" },
      { key: "jtbd",    label: "Jobs-to-be-Done",sublabel: "任務理論 × 需求洞察" },
      { key: "journey", label: "顧客旅程圖",    sublabel: "5 階段觸點與情緒分析" },
      { key: "rfm",     label: "RFM 分析",      sublabel: "近度·頻率·消費分群" },
      { key: "empathy", label: "同理心地圖",    sublabel: "Think / Feel / See / Do" },
    ],
  },
  {
    id: "pricing",
    icon: <FontAwesomeIcon icon={faDollarSign} className="text-2xl" />,
    label: "定價策略",
    description: "12 種定價方法，找到你的最佳模型",
    color: "bg-green-50 border-green-200 text-green-700",
    methodologies: [
      { key: "penetration",   label: "滲透定價",   sublabel: "低價搶市佔，後期拉升" },
      { key: "skimming",      label: "吸脂定價",   sublabel: "高開低走，收割早期用戶" },
      { key: "value-based",   label: "價值定價",   sublabel: "EVE 模型，捕捉差異化價值" },
      { key: "cost-plus",     label: "成本加成",   sublabel: "成本結構 + 目標利潤率" },
      { key: "competitive",   label: "競爭導向",   sublabel: "動態跟隨與差異化定位" },
      { key: "freemium",      label: "免費增值",   sublabel: "轉換設計 × SaaS 漏斗" },
      { key: "anchor",        label: "拋錨定價",   sublabel: "Good/Better/Best 三層架構" },
      { key: "decoy",         label: "誘餌效應",   sublabel: "不對稱選項設計" },
      { key: "psychological", label: "心理定價",   sublabel: ".99 效應 × 左位數效應" },
      { key: "dynamic",       label: "動態定價",   sublabel: "即時供需定價演算法" },
      { key: "subscription",  label: "訂閱模式",   sublabel: "LTV × 流失率 × 鎖入設計" },
      { key: "bundle",        label: "組合定價",   sublabel: "純組合 vs 混合組合拆解" },
    ],
  },
  {
    id: "promotion",
    icon: <FontAwesomeIcon icon={faBullhorn} className="text-2xl" />,
    label: "推廣策略",
    description: "品牌傳播方法論，從觸達到口碑",
    color: "bg-orange-50 border-orange-200 text-orange-700",
    methodologies: [
      { key: "kotler-5a",     label: "Kotler 5A",    sublabel: "Aware→Appeal→Ask→Act→Advocate" },
      { key: "aida",          label: "AIDA 模型",    sublabel: "注意·興趣·欲望·行動" },
      { key: "aisas",         label: "AISAS 模型",   sublabel: "數位時代搜尋+分享鏈" },
      { key: "aarrr",         label: "AARRR 成長框架",sublabel: "海盜指標 × 漏桶找缺口" },
      { key: "content-funnel",label: "內容行銷漏斗", sublabel: "ToFu / MoFu / BoFu" },
      { key: "inbound",       label: "Inbound 飛輪", sublabel: "吸引→轉換→成交→取悅" },
      { key: "wom",           label: "口碑行銷 WOMM",sublabel: "Talk Trigger × 引爆點設計" },
    ],
  },
  {
    id: "channel",
    icon: <FontAwesomeIcon icon={faNetworkWired} className="text-2xl" />,
    label: "通路與產品",
    description: "上市策略、通路設計與新品開發",
    color: "bg-rose-50 border-rose-200 text-rose-700",
    methodologies: [
      { key: "dtc",           label: "DTC 直銷策略",  sublabel: "自建通路 × 單位經濟" },
      { key: "marketplace",   label: "平台通路策略",  sublabel: "蝦皮/Shopify 可見度設計" },
      { key: "gtm",           label: "GTM 上市計畫",  sublabel: "ICP → 分銷 → 8週上市序" },
      { key: "stage-gate",    label: "Stage-Gate 新品",sublabel: "5 道關卡 + 死亡標準" },
      { key: "lean-startup",  label: "Lean Startup",  sublabel: "MVP × Build-Measure-Learn" },
      { key: "design-thinking",label: "設計思考",    sublabel: "Empathize→Define→Ideate→Test" },
    ],
  },
];

// ─── Page ───────────────────────────────────────────────────────────────────

export default function StrategyConsultantPage() {
  const ctx = useOutletContext<ShellOutletCtx>() ?? ({} as ShellOutletCtx);
  const brandId = ctx.brandId ?? undefined;
  const currentBrand = (ctx.brands || []).find((b: any) => b?.id === ctx.brandId);

  // Step machine
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [scenario, setScenario] = useState<ScenarioConfig | null>(null);
  const [methodology, setMethodology] = useState<{ key: string; label: string } | null>(null);
  const [agent, setAgent] = useState<any | null>(null);
  const [question, setQuestion] = useState("");

  // Session state
  const [messages, setMessages] = useState<MsgBubble[]>([]);
  const [chatInput, setChatInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // tRPC
  const agentsQuery = (trpc as any).strategyConsultant.listAgents.useQuery(
    { scenario: scenario?.id ?? "business", limit: 20 },
    { enabled: step >= 3 && !!scenario }
  );

  const analyzeMut = (trpc as any).strategyConsultant.analyze.useMutation();
  const chatMut    = (trpc as any).strategyConsultant.chat.useMutation();

  // Step handlers
  const onPickScenario = (s: ScenarioConfig) => {
    setScenario(s);
    setMethodology(null);
    setStep(2);
  };

  const onPickMethodology = (m: { key: string; label: string }) => {
    setMethodology(m);
    setStep(3);
  };

  const onPickAgent = (a: any) => {
    setAgent(a);
    setStep(4);
    setMessages([]);
  };

  const onAnalyze = async () => {
    if (!scenario || !methodology || !agent) return;
    const q = question.trim() || "請針對我的品牌進行全面的策略分析，並給出具體行動建議。";
    setMessages([{ role: "user", content: q }]);
    setQuestion("");
    try {
      const res = await analyzeMut.mutateAsync({
        agentId:     agent.id,
        brandId:     brandId,
        scenario:    scenario.id,
        methodology: methodology.key,
        question:    q,
      });
      setMessages([
        { role: "user",      content: q },
        { role: "assistant", content: res.report, agentName: res.agentName },
      ]);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `❌ 分析失敗：${e?.message ?? "請稍後再試"}`, agentName: agent?.name },
      ]);
    }
  };

  const onChat = async () => {
    if (!chatInput.trim() || !scenario || !methodology || !agent) return;
    const userMsg: MsgBubble = { role: "user", content: chatInput.trim() };
    const history = [...messages, userMsg];
    setMessages(history);
    setChatInput("");
    try {
      const res = await chatMut.mutateAsync({
        agentId:     agent.id,
        brandId:     brandId,
        scenario:    scenario.id,
        methodology: methodology.key,
        messages:    history.map((m) => ({ role: m.role, content: m.content })),
      });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.reply, agentName: res.agentName },
      ]);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `❌ 回覆失敗：${e?.message ?? "請稍後再試"}`, agentName: agent?.name },
      ]);
    }
  };

  const reset = () => {
    setStep(1); setScenario(null); setMethodology(null);
    setAgent(null); setMessages([]); setQuestion(""); setChatInput("");
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-[calc(100vh-3rem)] bg-gray-50 dark:bg-neutral-950">

      {/* ── Header bar ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white dark:bg-neutral-900 border-b border-gray-100 dark:border-neutral-800 px-6 py-3 flex items-center gap-4">
        {step > 1 && (
          <button
            onClick={() => setStep((s) => Math.max(1, s - 1) as any)}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-neutral-200 transition-colors"
          >
            <FontAwesomeIcon icon={faArrowLeft} />
          </button>
        )}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <FontAwesomeIcon icon={faBrain} className="text-orange-500" />
          <span className="font-semibold text-gray-800 dark:text-neutral-100 text-sm">策略顧問</span>
          {scenario && (
            <>
              <span className="text-gray-300 dark:text-neutral-600">/</span>
              <span className="text-sm text-gray-600 dark:text-neutral-400">{scenario.label}</span>
            </>
          )}
          {methodology && (
            <>
              <span className="text-gray-300 dark:text-neutral-600">/</span>
              <span className="text-sm text-gray-600 dark:text-neutral-400">{methodology.label}</span>
            </>
          )}
          {agent && (
            <>
              <span className="text-gray-300 dark:text-neutral-600">/</span>
              <span className="text-sm text-orange-600 dark:text-orange-400 font-medium">{agent.name}</span>
            </>
          )}
        </div>

        {/* Step pills */}
        <div className="hidden sm:flex items-center gap-1.5">
          {[1,2,3,4].map((s) => (
            <div key={s} className={[
              "w-6 h-6 rounded-full text-xs flex items-center justify-center font-bold transition-colors",
              step === s
                ? "bg-orange-500 text-white"
                : step > s
                  ? "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
                  : "bg-gray-100 text-gray-400 dark:bg-neutral-800 dark:text-neutral-600",
            ].join(" ")}>
              {step > s ? <FontAwesomeIcon icon={faCheck} className="text-[10px]" /> : s}
            </div>
          ))}
        </div>

        {currentBrand && (
          <Chip size="sm" variant="flat" className="hidden md:flex shrink-0">
            {currentBrand.name}
          </Chip>
        )}

        {step > 1 && (
          <button
            onClick={reset}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-neutral-300 transition-colors flex items-center gap-1 shrink-0"
          >
            <FontAwesomeIcon icon={faRotateRight} className="text-[10px]" /> 重新開始
          </button>
        )}
      </div>

      {/* ── Step 1: Scenario cards ───────────────────────────────────────── */}
      {step === 1 && (
        <div className="max-w-5xl mx-auto px-6 py-10">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100 mb-2">
              你今天想解決什麼策略問題？
            </h1>
            <p className="text-sm text-gray-500 dark:text-neutral-400">
              選擇一個場景，系統會為你匹配最合適的策略框架與顧問
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                onClick={() => onPickScenario(s)}
                className={[
                  "text-left p-5 rounded-2xl border-2 transition-all hover:shadow-md hover:-translate-y-0.5",
                  "bg-white dark:bg-neutral-900 dark:border-neutral-700 hover:border-orange-300 dark:hover:border-orange-600",
                  "group",
                ].join(" ")}
              >
                <div className={[
                  "w-10 h-10 rounded-xl flex items-center justify-center mb-3",
                  s.color,
                ].join(" ")}>
                  {s.icon}
                </div>
                <p className="font-bold text-gray-900 dark:text-neutral-100 mb-1 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                  {s.label}
                </p>
                <p className="text-xs text-gray-500 dark:text-neutral-400 leading-relaxed">
                  {s.description}
                </p>
                <div className="mt-3 flex items-center gap-1 text-orange-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-medium">
                  選擇 <FontAwesomeIcon icon={faArrowRight} className="text-[10px]" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 2: Methodology selection ───────────────────────────────── */}
      {step === 2 && scenario && (
        <div className="max-w-4xl mx-auto px-6 py-10">
          <div className="mb-8">
            <div className={["inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium mb-3", scenario.color].join(" ")}>
              {scenario.icon} {scenario.label}
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100 mb-2">
              選擇分析框架
            </h1>
            <p className="text-sm text-gray-500 dark:text-neutral-400">
              顧問將以這個方法論為核心，提供結構化的麥肯錫水準分析
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {scenario.methodologies.map((m) => (
              <button
                key={m.key}
                onClick={() => onPickMethodology(m)}
                className={[
                  "text-left p-4 rounded-xl border-2 transition-all hover:shadow-md",
                  "bg-white dark:bg-neutral-900 dark:border-neutral-700 hover:border-orange-300 dark:hover:border-orange-600 group",
                ].join(" ")}
              >
                <p className="font-semibold text-gray-900 dark:text-neutral-100 text-sm mb-1 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                  {m.label}
                </p>
                <p className="text-xs text-gray-400 dark:text-neutral-500">{m.sublabel}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 3: Consultant grid ──────────────────────────────────────── */}
      {step === 3 && scenario && methodology && (
        <div className="max-w-5xl mx-auto px-6 py-10">
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3 text-sm text-gray-500 dark:text-neutral-400">
              <Chip size="sm" variant="flat" className={scenario.color}>{scenario.label}</Chip>
              <span>/</span>
              <Chip size="sm" variant="flat">{methodology.label}</Chip>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100 mb-2">
              選擇你的策略顧問
            </h1>
            <p className="text-sm text-gray-500 dark:text-neutral-400">
              每位顧問都有獨特的專長與方法論，選一位來做深度分析
            </p>
          </div>

          {agentsQuery.isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800 space-y-2">
                  <Skeleton className="w-12 h-12 rounded-full" />
                  <Skeleton className="h-3 w-3/4 rounded" />
                  <Skeleton className="h-2.5 w-full rounded" />
                  <Skeleton className="h-2.5 w-2/3 rounded" />
                </div>
              ))}
            </div>
          )}

          {!agentsQuery.isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {(agentsQuery.data ?? []).map((a: any) => (
                <button
                  key={a.id}
                  onClick={() => onPickAgent(a)}
                  className="text-left bg-white dark:bg-neutral-900 rounded-2xl p-4 border-2 border-gray-100 dark:border-neutral-800 hover:border-orange-300 dark:hover:border-orange-600 hover:shadow-md transition-all group"
                >
                  <AgentAvatar seed={a.id ?? a.name} size={48} className="rounded-full mb-3 ring-2 ring-gray-100 dark:ring-neutral-700 group-hover:ring-orange-300 dark:group-hover:ring-orange-600 transition-all" />
                  <p className="font-bold text-sm text-gray-900 dark:text-neutral-100 mb-0.5 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors line-clamp-1">
                    {a.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-neutral-400 line-clamp-2 leading-relaxed mb-2">
                    {a.title}
                  </p>
                  {a.specialty && (
                    <p className="text-[10px] text-gray-400 dark:text-neutral-600 line-clamp-2">
                      {a.specialty.split(",").slice(0, 3).join(" · ")}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Step 4: Session (report + Q&A) ──────────────────────────────── */}
      {step === 4 && scenario && methodology && agent && (
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 flex flex-col gap-4">

          {/* Agent info bar */}
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-neutral-800 p-4 flex items-center gap-3">
            <AgentAvatar seed={agent.id ?? agent.name} size={48} className="rounded-full ring-2 ring-orange-200 dark:ring-orange-800 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-gray-900 dark:text-neutral-100">{agent.name}</p>
              <p className="text-sm text-gray-500 dark:text-neutral-400 truncate">{agent.title}</p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <Chip size="sm" variant="flat" className={scenario.color}>{scenario.label}</Chip>
              <Chip size="sm" variant="flat">{methodology.label}</Chip>
            </div>
          </div>

          {/* Initial question (only show before first analysis) */}
          {messages.length === 0 && !analyzeMut.isPending && (
            <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-neutral-800 p-5">
              <p className="text-sm font-semibold text-gray-700 dark:text-neutral-200 mb-3">
                告訴 {agent.name} 你的問題或背景（可選）
              </p>
              <Textarea
                placeholder={`例：我的品牌是中高端保養品，主力客群是 28–40 歲女性，目前面臨電商平台競爭激烈，想了解如何用 ${methodology.label} 找出新出路…`}
                variant="bordered"
                minRows={4}
                maxRows={8}
                value={question}
                onValueChange={setQuestion}
                classNames={{ input: "text-sm" }}
              />
              <Button
                color="primary"
                size="lg"
                radius="full"
                className="mt-4 w-full font-semibold"
                onPress={onAnalyze}
                isLoading={analyzeMut.isPending}
                startContent={!analyzeMut.isPending && <FontAwesomeIcon icon={faBrain} />}
              >
                {analyzeMut.isPending ? `${agent.name} 正在分析中…` : "開始策略分析"}
              </Button>
            </div>
          )}

          {/* Loading skeleton */}
          {analyzeMut.isPending && messages.length <= 1 && (
            <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-neutral-800 p-6 space-y-3">
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-neutral-400 mb-4">
                <Spinner size="sm" />
                <span>{agent.name} 正在運用 {methodology.label} 框架進行分析，請稍候…</span>
              </div>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className={`h-3 rounded ${i % 3 === 2 ? "w-2/3" : "w-full"}`} />
              ))}
            </div>
          )}

          {/* Messages thread */}
          {messages.length > 0 && (
            <div className="space-y-4">
              {messages.map((msg, idx) => (
                <div key={idx} className={["flex gap-3", msg.role === "user" ? "flex-row-reverse" : ""].join(" ")}>
                  {/* Avatar */}
                  {msg.role === "assistant" ? (
                    <AgentAvatar seed={agent.id ?? agent.name} size={36} className="rounded-full ring-2 ring-orange-200 dark:ring-orange-800 shrink-0 self-start mt-1" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-neutral-700 flex items-center justify-center shrink-0 self-start mt-1">
                      <FontAwesomeIcon icon={faUser} className="text-gray-500 dark:text-neutral-400 text-sm" />
                    </div>
                  )}

                  {/* Bubble */}
                  <div className={[
                    "rounded-2xl px-5 py-4 max-w-[88%]",
                    msg.role === "user"
                      ? "bg-orange-500 text-white ml-auto"
                      : "bg-white dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800",
                  ].join(" ")}>
                    {msg.role === "user" ? (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <ScrollShadow className="max-h-[800px]">
                        <article className={[
                          "prose prose-sm max-w-none",
                          "prose-headings:font-bold prose-headings:tracking-tight",
                          "prose-h1:text-xl prose-h1:mt-0",
                          "prose-h2:text-base prose-h2:text-orange-600 dark:prose-h2:text-orange-400",
                          "prose-h3:text-sm prose-h3:mt-3",
                          "prose-p:text-sm prose-p:leading-relaxed prose-p:text-gray-700 dark:prose-p:text-neutral-300",
                          "prose-ul:my-2 prose-li:my-0.5 prose-li:text-sm",
                          "prose-strong:text-gray-900 dark:prose-strong:text-neutral-100",
                          "prose-blockquote:border-l-orange-400 prose-blockquote:text-gray-600 dark:prose-blockquote:text-neutral-400",
                          "prose-code:text-xs prose-code:bg-gray-100 dark:prose-code:bg-neutral-800 prose-code:rounded prose-code:px-1",
                          "dark:prose-invert",
                        ].join(" ")}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        </article>
                      </ScrollShadow>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Q&A input (shown after first report) */}
          {messages.length >= 2 && (
            <div className="sticky bottom-4 bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-neutral-800 p-3 shadow-lg">
              <div className="flex items-end gap-2">
                <Textarea
                  placeholder={`繼續向 ${agent.name} 提問…`}
                  variant="flat"
                  minRows={1}
                  maxRows={5}
                  value={chatInput}
                  onValueChange={setChatInput}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onChat(); }
                  }}
                  classNames={{
                    base: "flex-1",
                    input: "text-sm",
                    inputWrapper: "bg-gray-50 dark:bg-neutral-800 shadow-none border-none",
                  }}
                  isDisabled={chatMut.isPending}
                />
                <Button
                  isIconOnly
                  color="primary"
                  radius="full"
                  size="md"
                  onPress={onChat}
                  isLoading={chatMut.isPending}
                  isDisabled={!chatInput.trim()}
                  aria-label="送出"
                  className="shrink-0 mb-0.5"
                >
                  {!chatMut.isPending && <FontAwesomeIcon icon={faPaperPlane} />}
                </Button>
              </div>
              <p className="text-[10px] text-gray-400 dark:text-neutral-600 mt-1.5 px-1">
                Enter 送出 · Shift+Enter 換行 · 顧問記得完整對話歷史
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
