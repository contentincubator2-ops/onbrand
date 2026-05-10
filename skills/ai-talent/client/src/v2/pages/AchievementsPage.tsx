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
  CheckCircle2, ChevronLeft, ChevronRight,
} from "lucide-react";

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

        {/* Top stats */}
        <div className="bg-white border border-neutral-200 rounded-xl p-6 mb-6">
          <h1 className="text-2xl font-bold text-neutral-900 mb-1">你的成就</h1>
          <p className="text-sm text-neutral-500 mb-6">完成所有路線 = 你已經是 Drop 高手</p>

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

        {/* Routes */}
        {ROUTE_ORDER.map((routeKey) => {
          const items = grouped[routeKey];
          if (!items?.length) return null;
          const meta = progress?.routeMeta?.[routeKey];
          const stats = progress?.byRoute?.[routeKey];
          return (
            <div key={routeKey} className="bg-white border border-neutral-200 rounded-xl p-6 mb-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs text-neutral-400 font-mono">{meta?.dayHint}</p>
                  <h2 className="text-lg font-bold text-neutral-900">{meta?.label}</h2>
                  <p className="text-xs text-neutral-500">{meta?.subtitle}</p>
                </div>
                {stats && (
                  <span className="text-sm font-semibold text-neutral-700">
                    {stats.unlocked} / {stats.total}
                  </span>
                )}
              </div>

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
