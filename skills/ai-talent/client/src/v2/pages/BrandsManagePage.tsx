/**
 * /brands — Brand Manager dashboard.
 *
 * 2026-05-11 (CJ「我需要管理我所有的品牌，看每個底下有多少活動和產品，
 * 可以新增 / 刪除」).
 *
 * Layout:
 *   Top bar:   page title + 新增品牌 button
 *   Body:      grid of brand cards, each showing:
 *              - logo + name
 *              - product / event / mission / output counts
 *              - last activity date
 *              - actions (進入編輯 / 刪除)
 *   Empty:     same as before — onboarding wizard CTA
 *
 * Editor (current /brands content) moves to /brands/edit?b=:id
 */
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { useOutletContext } from "react-router-dom";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import { showToastGlobal } from "../../components/ui/Toast";
import {
  Plus, Trash2, ChevronRight, Calendar, Package, Layers,
  FileText, ExternalLink, AlertTriangle,
} from "lucide-react";

export default function BrandsManagePage() {
  const navigate = useNavigate();
  const ctx = useOutletContext<ShellOutletCtx>();
  const utils = trpc.useUtils();

  const listQuery = (trpc as any).brand?.listWithStats?.useQuery
    ? (trpc as any).brand.listWithStats.useQuery(undefined, { refetchOnWindowFocus: false })
    : { data: [], refetch: () => {} };
  const brands = (listQuery?.data ?? []) as Array<any>;

  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const deleteMut = (trpc as any).brand?.delete?.useMutation
    ? (trpc as any).brand.delete.useMutation({
        onSuccess: () => {
          showToastGlobal("品牌已刪除", "success");
          listQuery?.refetch?.();
          (utils as any).brand?.list?.invalidate?.();
          setPendingDelete(null);
          setConfirmText("");
        },
        onError: (e: any) => showToastGlobal(`刪除失敗：${e?.message ?? e}`),
      })
    : null;

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (24 * 3600_000));
    if (diffDays === 0) return "今天";
    if (diffDays === 1) return "昨天";
    if (diffDays < 7) return `${diffDays} 天前`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} 週前`;
    return d.toLocaleDateString("zh-TW");
  };

  if (listQuery?.isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-neutral-500 text-sm">
        載入品牌中…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 py-8 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-neutral-400 mb-2">
              BRAND MANAGER
            </p>
            <h1 className="text-3xl font-bold text-neutral-900">所有品牌</h1>
            <p className="text-sm text-neutral-500 mt-1">
              {brands.length === 0
                ? "還沒有任何品牌"
                : `${brands.length} 個品牌 · 點任一張卡片進入編輯`
              }
            </p>
          </div>
          <button
            onClick={() => navigate("/brands/edit?new=1")}
            className="px-4 py-2.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-semibold transition flex items-center gap-2"
          >
            <Plus size={16} /> 新增品牌
          </button>
        </div>

        {/* Empty state */}
        {brands.length === 0 ? (
          <div className="bg-white border border-dashed border-neutral-300 rounded-xl py-16 px-6 text-center">
            <div className="max-w-sm mx-auto">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400 mb-3">
                STEP 1
              </p>
              <h2 className="text-xl font-bold text-neutral-900 mb-2">建立你的第一個品牌</h2>
              <p className="text-sm text-neutral-500 mb-6">
                品牌是 Drop 一切的起點。建立後 AI 自動分析定位、用詞、視覺風格，
                之後所有任務都會吃這份品牌大腦。
              </p>
              <button
                onClick={() => navigate("/brands/edit?new=1")}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-semibold transition"
              >
                開始建立
                <Plus size={14} />
              </button>
            </div>
          </div>
        ) : (
          /* Brand grid */
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {brands.map((b) => (
              <BrandCard
                key={b.id}
                brand={b}
                onOpen={() => {
                  // Set scope to this brand + go to editor
                  ctx?.setBrandId?.(b.id);
                  navigate(`/brands/edit?b=${b.id}`);
                }}
                onDelete={() => setPendingDelete({ id: b.id, name: b.name })}
                lastActivityLabel={formatDate(b.lastActivity)}
              />
            ))}
          </div>
        )}

        {/* Delete confirmation modal */}
        {pendingDelete && (
          <div
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6"
            onClick={() => { setPendingDelete(null); setConfirmText(""); }}
          >
            <div
              className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle size={22} className="text-red-600 mt-0.5" />
                <div>
                  <h3 className="text-base font-semibold text-neutral-900 mb-1">
                    刪除品牌「{pendingDelete.name}」？
                  </h3>
                  <p className="text-sm text-neutral-600 leading-relaxed">
                    這個動作無法還原。品牌底下的產品、活動、任務、產出紀錄都會一併刪除。
                  </p>
                </div>
              </div>
              <p className="text-xs text-neutral-700 mb-2">
                請輸入品牌名稱「{pendingDelete.name}」確認刪除：
              </p>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={pendingDelete.name}
                autoFocus
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-neutral-900 mb-4"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setPendingDelete(null); setConfirmText(""); }}
                  className="px-4 py-2 text-sm rounded-lg border border-neutral-300 text-neutral-700 hover:border-neutral-500 transition"
                >
                  取消
                </button>
                <button
                  disabled={confirmText !== pendingDelete.name || !deleteMut || deleteMut.isPending}
                  onClick={() => deleteMut?.mutate({ id: pendingDelete.id })}
                  className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {deleteMut?.isPending ? "刪除中…" : "確認刪除"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BrandCard({
  brand, onOpen, onDelete, lastActivityLabel,
}: {
  brand: any;
  onOpen: () => void;
  onDelete: () => void;
  lastActivityLabel: string;
}) {
  const initial = (brand.name ?? "?").slice(0, 1).toUpperCase();
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-5 hover:border-neutral-400 transition group">
      <div className="flex items-start gap-3 mb-4">
        {/* Avatar */}
        <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-neutral-900 text-white flex items-center justify-center text-base font-bold overflow-hidden">
          {brand.logoUrl
            ? <img src={brand.logoUrl} alt={brand.name} className="w-full h-full object-cover" />
            : initial
          }
        </div>
        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-neutral-900 truncate">{brand.name}</h3>
          {brand.industry && (
            <p className="text-xs text-neutral-500 truncate">{brand.industry}</p>
          )}
          {brand.website && (
            <a
              href={brand.website.startsWith("http") ? brand.website : `https://${brand.website}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[11px] text-neutral-500 hover:text-neutral-900 inline-flex items-center gap-0.5"
            >
              {brand.website.replace(/^https?:\/\//, "")} <ExternalLink size={9} />
            </a>
          )}
        </div>
        {/* Quick delete (icon only, top-right) */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 transition text-neutral-400 hover:text-red-600 p-1"
          title="刪除品牌"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <Stat icon={Package}  label="產品" n={brand.productCount} />
        <Stat icon={Calendar} label="活動" n={brand.eventCount} />
        <Stat icon={Layers}   label="任務" n={brand.missionCount} />
        <Stat icon={FileText} label="產出" n={brand.outputCount} />
      </div>

      {/* Footer row */}
      <div className="flex items-center justify-between pt-3 border-t border-neutral-100">
        <span className="text-[11px] text-neutral-500">最近活動 · {lastActivityLabel}</span>
        <button
          onClick={onOpen}
          className="text-xs font-semibold text-neutral-900 hover:underline flex items-center gap-0.5"
        >
          進入編輯 <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, n }: { icon: any; label: string; n: number }) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1 text-neutral-700">
        <Icon size={11} strokeWidth={2} />
        <span className="text-base font-bold text-neutral-900">{n}</span>
      </div>
      <p className="text-[10px] text-neutral-500 mt-0.5">{label}</p>
    </div>
  );
}
