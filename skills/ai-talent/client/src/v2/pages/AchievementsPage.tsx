/**
 * /achievements — full catalog grid grouped by route, locked / unlocked
 * states + 下一步試試 suggestions panel.
 *
 * 2026-05-10 (CJ「成就系統，引導用戶使用完整個系統」).
 */
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import {
  Sparkles, Building2, Zap, LayoutGrid, MessageCircle, RefreshCw,
  Image, Video, Calendar, Layers, Flag, Pencil, Send,
  CalendarPlus, Mail, FolderCheck, Award, Crown, Lock,
  CheckCircle2, ChevronLeft, ChevronRight, Gift, Trophy,
} from "lucide-react";

/** Mini reward catalog — must mirror server/_core/achievementRewards.ts */
const ROUTE_REWARDS_DISPLAY: Record<string, string[]> = {
  onboarding:  ["額外 1 個品牌位（試用期間）"],
  explore:     ["額外 30 張 AI 圖（試用期間）"],
  visual:      ["額外 2 支 AI 影片（試用期間）"],
  planning:    ["解鎖「自動排程提醒」beta"],
  integration: ["解鎖「品牌風格匯出 PDF」"],
  publish:     ["試用期延長 3 天"],
  upgrade:     ["首月 9 折券（30 天內兌換）"],
};
const FINALE_REWARDS_DISPLAY = [
  "OnBrand Founding User 永久徽章",
  "首月 9 折券（重複領）",
  "年繳再折 7%（60 天內兌換）",
  "新功能搶先體驗",
];

const ICON_MAP: Record<string, any> = {
  Sparkles, Building2, Zap, LayoutGrid, MessageCircle, RefreshCw,
  Image, Video, Calendar, Layers, Flag, Pencil, Send,
  CalendarPlus, Mail, FolderCheck, Award, Crown,
};

function AchIcon({ name, locked }: { name: string; locked: boolean }) {
  const Icon = ICON_MAP[name] ?? Sparkles;
  return (
    <Icon
      size={22}
      strokeWidth={2}
      className={locked ? "text-neutral-400" : "text-neutral-900"}
    />
  );
}

export default function AchievementsPage() {
  const navigate = useNavigate();
  const listQuery = (trpc as any).achievements?.list?.useQuery
    ? (trpc as any).achievements.list.useQuery()
    : { data: [] };
  const progressQuery = (trpc as any).achievements?.getProgress?.useQuery
    ? (trpc as any).achievements.getProgress.useQuery()
    : { data: null };

  const list = (listQuery?.data ?? []) as Array<any>;
  const progress = progressQuery?.data;

  // Group by route, preserving route order
  const ROUTE_ORDER = ["onboarding", "explore", "visual", "planning", "integration", "publish", "upgrade"];
  const grouped: Record<string, any[]> = {};
  for (const r of ROUTE_ORDER) grouped[r] = [];
  for (const a of list) {
    if (grouped[a.route]) grouped[a.route].push(a);
  }
  for (const r of ROUTE_ORDER) {
    grouped[r].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  return (
    <div className="min-h-screen bg-neutral-50 py-8 px-6">
      <div className="max-w-5xl mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-neutral-500 hover:text-neutral-900 flex items-center gap-1 mb-6"
        >
          <ChevronLeft size={16} /> 返回
        </button>

        {/* 2026-05-11 (CJ): canonical header template — same as /30s · /60s · /99s. */}
        <div className="text-center mb-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-default-600 mb-3">
            ACHIEVEMENTS · ROUTES
          </p>
          <h1
            className="font-semibold tracking-tight leading-tight mx-auto"
            style={{
              fontSize: "clamp(1.6rem, 3vw, 2.25rem)",
              background: "linear-gradient(135deg, #00b4bc 0%, #7c3aed 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            你的成就
          </h1>
          <p
            className="mt-3 mx-auto text-default-700"
            style={{
              fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
              fontStyle: "italic", fontSize: 14, lineHeight: 1.7, maxWidth: 640,
            }}
          >
            完成所有路線 = 你已經是 Drop 高手
          </p>
          <p
            className="mt-2 mx-auto text-default-700"
            style={{ fontSize: 12, lineHeight: 1.55, maxWidth: 640, letterSpacing: "0.02em" }}
          >
            <span style={{ fontWeight: 600, color: "#171717", marginRight: 6 }}>路線：</span>
            7 條 + 18 個成就 · 解完後系統會送你獎勵
          </p>
        </div>

        {/* Progress block */}
        <div className="bg-white border border-neutral-200 rounded-xl p-6 mb-6">

          {progress ? (
            <>
              {/* Progress bar */}
              <div className="flex items-end justify-between mb-3">
                <div>
                  <p className="text-3xl font-bold text-neutral-900">
                    {progress.unlockedCount} <span className="text-base font-medium text-neutral-500">/ {progress.totalCount}</span>
                  </p>
                  <p className="text-xs text-neutral-500 mt-1">
                    {progress.earnedPoints} 點 / 共 {progress.totalPoints} 點
                  </p>
                </div>
                <p className="text-xs text-neutral-500">
                  {Math.round((progress.unlockedCount / progress.totalCount) * 100)}%
                </p>
              </div>
              <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-neutral-900 transition-all"
                  style={{ width: `${(progress.unlockedCount / progress.totalCount) * 100}%` }}
                />
              </div>

              {/* Suggestions */}
              {progress.suggestions?.length > 0 && (
                <div className="mt-6 pt-6 border-t border-neutral-100">
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">下一步試試</p>
                  <div className="grid sm:grid-cols-3 gap-2">
                    {progress.suggestions.map((s: any) => (
                      <button
                        key={s.code}
                        onClick={() => s.ctaPath && navigate(s.ctaPath)}
                        className="text-left px-4 py-3 rounded-lg border border-neutral-200 hover:border-neutral-900 hover:bg-neutral-50 transition group"
                      >
                        <p className="text-sm font-semibold text-neutral-900 mb-0.5">{s.title}</p>
                        <p className="text-xs text-neutral-500 group-hover:text-neutral-700 flex items-center gap-1">
                          {s.ctaText ?? "前往"} <ChevronRight size={11} />
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-neutral-500">載入中…</p>
          )}
        </div>

        {/* Finale ribbon — show what's at the end of the journey */}
        <div className={`rounded-xl p-6 mb-6 border-2 ${
          progress?.unlockedCount === progress?.totalCount
            ? "border-neutral-900 bg-neutral-900 text-white"
            : "border-dashed border-neutral-300 bg-white"
        }`}>
          <div className="flex items-start gap-3">
            <Trophy size={28} className={progress?.unlockedCount === progress?.totalCount ? "text-amber-300" : "text-neutral-400"} />
            <div className="flex-1">
              <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${
                progress?.unlockedCount === progress?.totalCount ? "text-amber-300" : "text-neutral-500"
              }`}>
                完成全 18 個成就
              </p>
              <h3 className={`text-lg font-bold mb-2 ${
                progress?.unlockedCount === progress?.totalCount ? "text-white" : "text-neutral-900"
              }`}>
                OnBrand Founding User · 終極獎勵
              </h3>
              <ul className={`text-sm space-y-1 ${
                progress?.unlockedCount === progress?.totalCount ? "text-neutral-100" : "text-neutral-700"
              }`}>
                {FINALE_REWARDS_DISPLAY.map((reward, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className={progress?.unlockedCount === progress?.totalCount ? "text-amber-300" : "text-neutral-400"}>✦</span>
                    {reward}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Routes */}
        {ROUTE_ORDER.map((routeKey) => {
          const items = grouped[routeKey];
          if (!items?.length) return null;
          const meta = progress?.routeMeta?.[routeKey];
          const stats = progress?.byRoute?.[routeKey];
          return (
            <div key={routeKey} className="bg-white border border-neutral-200 rounded-xl p-6 mb-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-xs text-neutral-400 font-mono">{meta?.dayHint}</p>
                  <h2 className="text-lg font-bold text-neutral-900">{meta?.label}</h2>
                  <p className="text-xs text-neutral-500">{meta?.subtitle}</p>
                </div>
                {stats && (
                  <span className="text-sm font-semibold text-neutral-700 flex-shrink-0">
                    {stats.unlocked} / {stats.total}
                  </span>
                )}
              </div>

              {/* Reward badge — shows what user will earn for completing this route */}
              {ROUTE_REWARDS_DISPLAY[routeKey] && (
                <div className={`mb-4 px-3 py-2 rounded-lg border flex items-start gap-2 ${
                  stats?.unlocked === stats?.total
                    ? "bg-neutral-900 border-neutral-900 text-white"
                    : "bg-neutral-50 border-neutral-200 text-neutral-700"
                }`}>
                  <Gift size={14} className="mt-0.5 flex-shrink-0" />
                  <div className="flex-1 text-xs">
                    <p className="font-semibold">
                      {stats?.unlocked === stats?.total ? "已領獎勵：" : "完成可獲得："}
                    </p>
                    <p className="opacity-90">
                      {ROUTE_REWARDS_DISPLAY[routeKey].join(" · ")}
                    </p>
                  </div>
                </div>
              )}

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((a) => (
                  <div
                    key={a.code}
                    className={`p-4 rounded-lg border transition ${
                      a.unlocked
                        ? "border-neutral-900 bg-white"
                        : "border-neutral-200 bg-neutral-50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                        a.unlocked ? "bg-neutral-900 text-white" : "bg-neutral-200"
                      }`}>
                        {a.unlocked
                          ? <CheckCircle2 size={20} className="text-white" strokeWidth={2} />
                          : <AchIcon name={a.icon} locked />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold mb-0.5 ${
                          a.unlocked ? "text-neutral-900" : "text-neutral-500"
                        }`}>
                          {a.title}
                        </p>
                        <p className="text-xs text-neutral-500 leading-relaxed mb-2">
                          {a.description}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-mono ${a.unlocked ? "text-neutral-700" : "text-neutral-400"}`}>
                            {a.points} 點
                          </span>
                          {!a.unlocked && a.ctaPath && (
                            <Link
                              to={a.ctaPath}
                              className="text-[11px] text-neutral-900 hover:underline font-medium"
                            >
                              {a.ctaText ?? "前往"} →
                            </Link>
                          )}
                          {a.unlocked && (
                            <span className="text-[10px] text-neutral-500">
                              {a.unlockedAt ? new Date(a.unlockedAt).toLocaleDateString("zh-TW") : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <div className="text-center text-xs text-neutral-400 mt-8">
          <p>解鎖全部 18 個成就 = 你已用過 Drop 完整功能。然後就靠你的創意了 ✨</p>
        </div>
      </div>
    </div>
  );
}
