import { useState } from "react";
import { trpc } from "../lib/trpc";
import LoadingSpinner from "../components/LoadingSpinner";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "positioning" | "competitors" | "calendar" | "a2a";

interface PositioningForm {
  brandName: string;
  websiteUrl: string;
  industry: string;
  targetMarket: string;
  competitors: string;
}

interface CompetitorForm {
  brandName: string;
  industry: string;
  competitors: string;
  contentLanguage: string;
}

interface CalendarForm {
  brandName: string;
  weeks: number;
  platforms: string;
  targetMarket: string;
  contentLanguage: string;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ThreatBadge({ level }: { level: "high" | "medium" | "low" }) {
  const colors: Record<string, string> = {
    high: "bg-red-100 text-red-700",
    medium: "bg-yellow-100 text-yellow-700",
    low: "bg-green-100 text-green-700",
  };
  const labels: Record<string, string> = { high: "高威脅", medium: "中威脅", low: "低威脅" };
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${colors[level]}`}>
      {labels[level]}
    </span>
  );
}

function NodeStatusIcon({ status }: { status: string }) {
  if (status === "completed") return <span className="text-green-500">✅</span>;
  if (status === "failed") return <span className="text-red-500">❌</span>;
  if (status === "running") return <span className="animate-spin inline-block">⏳</span>;
  return <span className="text-gray-400">⬜</span>;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BrandAnalysis() {
  const [activeTab, setActiveTab] = useState<Tab>("positioning");

  // ── Positioning tab ──
  const [posForm, setPosForm] = useState<PositioningForm>({
    brandName: "", websiteUrl: "", industry: "", targetMarket: "", competitors: "",
  });
  const positioningMutation = trpc.brand.analyzeBrand.useMutation();

  // ── Competitor tab ──
  const [compForm, setCompForm] = useState<CompetitorForm>({
    brandName: "", industry: "", competitors: "", contentLanguage: "zh-TW",
  });
  const competitorMutation = trpc.brand.analyzeCompetitors.useMutation();

  // ── Calendar tab ──
  const [calForm, setCalForm] = useState<CalendarForm>({
    brandName: "", weeks: 4, platforms: "Facebook,Instagram", targetMarket: "", contentLanguage: "zh-TW",
  });
  const calendarMutation = trpc.brand.generateContentCalendar.useMutation();

  // ── A2A tab ──
  const [a2aWorkflowId, setA2aWorkflowId] = useState<"brand-launch-v1" | "market-research-v1">("brand-launch-v1");
  const a2aMutation = trpc.a2a.executeWorkflow.useMutation();
  const templatesQuery = (trpc as any).a2a.listTemplates.useQuery();

  // ── Handlers ──
  const handlePosSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    positioningMutation.mutate({
      brandName: posForm.brandName,
      websiteUrl: posForm.websiteUrl || undefined,
      industry: posForm.industry || undefined,
      targetMarket: posForm.targetMarket || undefined,
      competitors: posForm.competitors ? posForm.competitors.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    });
  };

  const handleCompSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    competitorMutation.mutate({
      brandName: compForm.brandName,
      industry: compForm.industry || undefined,
      competitors: compForm.competitors ? compForm.competitors.split(",").map((s) => s.trim()).filter(Boolean) : [],
      contentLanguage: compForm.contentLanguage,
      userApiKey: "auto",
    });
  };

  const handleCalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    calendarMutation.mutate({
      brandName: calForm.brandName,
      weeks: calForm.weeks,
      platforms: calForm.platforms.split(",").map((s) => s.trim()).filter(Boolean),
      targetMarket: calForm.targetMarket || undefined,
      contentLanguage: calForm.contentLanguage,
      userApiKey: "auto",
    });
  };

  const handleA2aRun = () => {
    a2aMutation.mutate({ workflowId: a2aWorkflowId });
  };

  // ── Tab config ──
  const tabs: { id: Tab; label: string }[] = [
    { id: "positioning", label: "🎯 品牌定位" },
    { id: "competitors", label: "🔍 競品分析" },
    { id: "calendar", label: "📅 內容日曆" },
    { id: "a2a", label: "⚙️ A2A 工作流" },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">品牌分析引擎</h1>
        <p className="text-gray-500 mt-1">AI 驅動的品牌定位、競品分析、內容策略一站式平台</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab: 品牌定位 ── */}
      {activeTab === "positioning" && (
        <div className="space-y-6">
          <form onSubmit={handlePosSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            {[
              { name: "brandName", label: "品牌名稱", required: true, placeholder: "例：SoWork", type: "text" },
              { name: "websiteUrl", label: "官方網站", required: false, placeholder: "https://sowork.ai", type: "url" },
              { name: "industry", label: "產業", required: false, placeholder: "例：AI SaaS、電商", type: "text" },
              { name: "targetMarket", label: "目標市場", required: false, placeholder: "例：台灣中小企業主", type: "text" },
              { name: "competitors", label: "競爭對手（逗號分隔）", required: false, placeholder: "例：HubSpot, Marketo", type: "text" },
            ].map((field) => (
              <div key={field.name}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {field.label} {field.required && <span className="text-red-500">*</span>}
                </label>
                <input
                  type={field.type}
                  name={field.name}
                  required={field.required}
                  value={(posForm as any)[field.name]}
                  onChange={(e) => setPosForm((prev) => ({ ...prev, [field.name]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            ))}
            <button
              type="submit"
              disabled={positioningMutation.isPending || !posForm.brandName.trim()}
              className="w-full bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {positioningMutation.isPending ? "分析中..." : "🎯 開始定位分析"}
            </button>
          </form>
          {positioningMutation.isPending && <LoadingSpinner size="lg" message="AI 正在分析您的品牌..." />}
          {positioningMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
              <strong>分析失敗：</strong> {positioningMutation.error.message}
            </div>
          )}
          {positioningMutation.isSuccess && positioningMutation.data && (
            <div className="mt-4 p-4 rounded-xl border border-neutral-200 bg-white dark:bg-neutral-800">
              <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">{posForm.brandName} — 定位分析結果</h3>
              <pre className="text-xs text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap">{typeof (positioningMutation.data as any) === 'string' ? (positioningMutation.data as any) : JSON.stringify(positioningMutation.data as any, null, 2)}</pre>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: 競品分析 ── */}
      {activeTab === "competitors" && (
        <div className="space-y-6">
          <form onSubmit={handleCompSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                品牌名稱 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={compForm.brandName}
                onChange={(e) => setCompForm((p) => ({ ...p, brandName: e.target.value }))}
                placeholder="例：SoWork"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">產業</label>
              <input
                type="text"
                value={compForm.industry}
                onChange={(e) => setCompForm((p) => ({ ...p, industry: e.target.value }))}
                placeholder="例：AI SaaS、數位行銷"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">已知競品（逗號分隔）</label>
              <input
                type="text"
                value={compForm.competitors}
                onChange={(e) => setCompForm((p) => ({ ...p, competitors: e.target.value }))}
                placeholder="例：HubSpot, Marketo, ActiveCampaign"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              type="submit"
              disabled={competitorMutation.isPending || !compForm.brandName.trim()}
              className="w-full bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {competitorMutation.isPending ? "分析中..." : "🔍 開始競品分析"}
            </button>
          </form>

          {competitorMutation.isPending && <LoadingSpinner size="lg" message="AI 正在分析競品格局..." />}
          {competitorMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
              <strong>分析失敗：</strong> {competitorMutation.error.message}
            </div>
          )}
          {competitorMutation.isSuccess && competitorMutation.data && (() => {
            const data = competitorMutation.data as any;
            return (
              <div className="space-y-4">
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
                  <h3 className="font-semibold text-indigo-800 mb-1">📍 市場定位</h3>
                  <p className="text-indigo-700 text-sm">{data.marketPosition}</p>
                </div>

                <div className="space-y-3">
                  <h3 className="font-semibold text-gray-900">🏆 競品分析</h3>
                  {data.competitors?.map((comp: any, i: number) => (
                    <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900">{comp.name}</span>
                        <ThreatBadge level={comp.threat_level} />
                      </div>
                      <p className="text-xs text-gray-600">{comp.positioning}</p>
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        <div>
                          <div className="text-xs font-medium text-green-700 mb-1">✅ 優勢</div>
                          <ul className="text-xs text-gray-600 space-y-0.5">
                            {comp.strengths?.map((s: string, j: number) => <li key={j}>• {s}</li>)}
                          </ul>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-red-700 mb-1">❌ 弱點</div>
                          <ul className="text-xs text-gray-600 space-y-0.5">
                            {comp.weaknesses?.map((w: string, j: number) => <li key={j}>• {w}</li>)}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <h3 className="font-semibold text-gray-900 mb-2">💡 市場機會</h3>
                  <ul className="text-sm text-gray-700 space-y-1">
                    {data.opportunities?.map((o: string, i: number) => <li key={i}>• {o}</li>)}
                  </ul>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
                  <h3 className="font-semibold text-emerald-800 mb-2">🎯 策略建議</h3>
                  <ul className="text-sm text-emerald-700 space-y-1">
                    {data.recommendations?.map((r: string, i: number) => <li key={i}>{i + 1}. {r}</li>)}
                  </ul>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Tab: 內容日曆 ── */}
      {activeTab === "calendar" && (
        <div className="space-y-6">
          <form onSubmit={handleCalSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                品牌名稱 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={calForm.brandName}
                onChange={(e) => setCalForm((p) => ({ ...p, brandName: e.target.value }))}
                placeholder="例：SoWork"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">週數（1-12 週）</label>
              <input
                type="number"
                min={1} max={12}
                value={calForm.weeks}
                onChange={(e) => setCalForm((p) => ({ ...p, weeks: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">平台（逗號分隔）</label>
              <input
                type="text"
                value={calForm.platforms}
                onChange={(e) => setCalForm((p) => ({ ...p, platforms: e.target.value }))}
                placeholder="Facebook,Instagram,LinkedIn"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">目標市場</label>
              <input
                type="text"
                value={calForm.targetMarket}
                onChange={(e) => setCalForm((p) => ({ ...p, targetMarket: e.target.value }))}
                placeholder="例：台灣中小企業主"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              type="submit"
              disabled={calendarMutation.isPending || !calForm.brandName.trim()}
              className="w-full bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {calendarMutation.isPending ? "生成中..." : "📅 生成內容日曆"}
            </button>
          </form>

          {calendarMutation.isPending && <LoadingSpinner size="lg" message="AI 正在規劃您的內容策略..." />}
          {calendarMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
              <strong>生成失敗：</strong> {calendarMutation.error.message}
            </div>
          )}
          {calendarMutation.isSuccess && calendarMutation.data && (() => {
            const data = calendarMutation.data as any;
            return (
              <div className="space-y-4">
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
                  <h3 className="font-semibold text-indigo-800 mb-1">📊 內容策略</h3>
                  <p className="text-indigo-700 text-sm">{data.contentStrategy}</p>
                </div>
                {data.weeks?.map((week: any) => (
                  <div key={week.weekNumber} className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="bg-indigo-100 text-indigo-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                        第 {week.weekNumber} 週
                      </span>
                      <span className="font-medium text-gray-800">{week.theme}</span>
                    </div>
                    <div className="space-y-2">
                      {week.posts?.map((post: any, j: number) => (
                        <div key={j} className="border border-gray-100 rounded-lg p-3 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-gray-500">{post.day}</span>
                            <span className="bg-blue-50 text-blue-600 text-xs px-1.5 py-0.5 rounded">{post.platform}</span>
                            <span className="bg-gray-50 text-gray-500 text-xs px-1.5 py-0.5 rounded">{post.contentType}</span>
                          </div>
                          <p className="text-sm font-medium text-gray-800">{post.headline}</p>
                          <p className="text-xs text-gray-600">{post.caption}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {post.hashtags?.map((tag: string, k: number) => (
                              <span key={k} className="text-xs text-indigo-500">#{tag}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Tab: A2A 工作流 ── */}
      {activeTab === "a2a" && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <div>
              <h2 className="text-base font-semibold text-gray-900 mb-1">⚙️ A2A 工作流引擎</h2>
              <p className="text-sm text-gray-500">
                多 Agent 串並行工作鏈。一鍵啟動，從品牌定位到廣告文案全自動生成。
              </p>
            </div>

            {/* Template selection */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">選擇工作流模板</label>
              <div className="grid grid-cols-1 gap-2">
                {(templatesQuery.data as any[])?.map((t: any) => (
                  <button
                    key={t.id}
                    onClick={() => setA2aWorkflowId(t.id as any)}
                    className={`text-left border rounded-lg p-3 transition-colors ${
                      a2aWorkflowId === t.id
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="font-medium text-sm text-gray-800">{t.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{t.nodeCount} 個任務節點</div>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleA2aRun}
              disabled={a2aMutation.isPending}
              className="w-full bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {a2aMutation.isPending ? "執行中..." : "🚀 啟動工作流"}
            </button>
          </div>

          {a2aMutation.isPending && (
            <LoadingSpinner size="lg" message="A2A 工作流執行中，Agent 串聯處理..." />
          )}

          {a2aMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
              <strong>執行失敗：</strong> {a2aMutation.error.message}
            </div>
          )}

          {a2aMutation.isSuccess && a2aMutation.data && (() => {
            const result = a2aMutation.data as any;
            const statusColors: Record<string, string> = {
              completed: "bg-green-50 border-green-200 text-green-800",
              partial: "bg-yellow-50 border-yellow-200 text-yellow-800",
              failed: "bg-red-50 border-red-200 text-red-800",
            };
            const statusLabels: Record<string, string> = {
              completed: "✅ 全部完成",
              partial: "⚠️ 部分完成",
              failed: "❌ 執行失敗",
            };
            return (
              <div className="space-y-3">
                <div className={`rounded-xl border p-4 ${statusColors[result.status] ?? ""}`}>
                  <div className="font-semibold">{statusLabels[result.status] ?? result.status}</div>
                  <div className="text-xs mt-0.5">完成時間：{new Date(result.completedAt).toLocaleString("zh-TW")}</div>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
                  <h3 className="font-semibold text-gray-900">📋 節點執行狀態</h3>
                  {Object.entries(result.nodeResults as Record<string, any>).map(([nodeId, node]) => (
                    <div key={nodeId} className="border border-gray-100 rounded-lg p-3 space-y-1">
                      <div className="flex items-center gap-2">
                        <NodeStatusIcon status={node.status} />
                        <span className="text-sm font-medium text-gray-800">{nodeId}</span>
                        {node.taskId && (
                          <span className="text-xs text-gray-400">Task #{node.taskId}</span>
                        )}
                      </div>
                      {node.error && (
                        <p className="text-xs text-red-600 pl-6">{node.error}</p>
                      )}
                      {node.output && (
                        <p className="text-xs text-gray-500 pl-6 line-clamp-2">{node.output.slice(0, 120)}...</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
