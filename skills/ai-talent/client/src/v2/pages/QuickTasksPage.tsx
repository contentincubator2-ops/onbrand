/**
 * QuickTasksPage — Canva-Magic-style single-shot AI task menu.
 *
 * Layout:
 *   1. Pastel hero ("AI 工具" + 「30 秒交付」副標)
 *   2. 12 task tiles (4-col grid)
 *   3. Click → modal with form built from server-side field schema
 *      → submit → calls trpc.quickTask.run → display output
 *
 * Backend lives in server/routers/quickTaskRouter.ts.
 */
import React, { useMemo, useState } from "react";
import { trpc } from "../../lib/trpc";

type TaskField = {
  key: string;
  label: string;
  kind: "text" | "longtext" | "url" | "select" | "number";
  placeholder?: string;
  options?: string[];
  required?: boolean;
  default?: string | number;
};

type TaskMeta = {
  id: string;
  label: string;
  fields: TaskField[];
};

const TILE_LOOK: Record<
  string,
  { bg: string; emoji: string; gradient?: string }
> = {
  "ig-hooks":              { bg: "#FCE0EA", emoji: "📸" },
  "linkedin-summary":      { bg: "#DCEAF7", emoji: "💼" },
  "rewrite-copy":          { bg: "#E4DCF5", emoji: "✍️" },
  "competitor-diff":       { bg: "#FCE7DD", emoji: "⚔️" },
  "hero-image-prompt":     { bg: "#FFE0CD", emoji: "🎨" },
  "audience-persona":      { bg: "#DEF1EE", emoji: "👥" },
  "tagline":               { bg: "#FAF1D9", emoji: "✨" },
  "swot":                  { bg: "#E1E5FB", emoji: "📊" },
  "campaign-idea":         { bg: "#F5D5E2", emoji: "🚀" },
  "translate-localize":    { bg: "#D9EBD7", emoji: "🌏" },
  "name-it":               { bg: "#EAD9F5", emoji: "🪄" },
  "social-listening-prompt": { bg: "#FBE9DA", emoji: "🔍" },
};

export default function QuickTasksPage() {
  const tasksQuery = (trpc as any).quickTask?.list?.useQuery?.(undefined, {
    refetchOnWindowFocus: false,
  }) ?? { data: [], isLoading: false };

  const tasks: TaskMeta[] = (tasksQuery.data as any[]) ?? [];

  const [activeId, setActiveId] = useState<string | null>(null);
  const activeTask = useMemo(
    () => tasks.find((t) => t.id === activeId) ?? null,
    [tasks, activeId]
  );

  return (
    <main className="pb-16">
      {/* HERO */}
      <section
        className="relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, #C8E8DA 0%, #DDD5F2 45%, #F5D5E2 100%)",
        }}
      >
        <div className="max-w-[1280px] mx-auto px-8 pt-20 pb-16 text-center">
          <div className="font-display text-[0.62rem] tracking-[0.28em] uppercase text-mos-soft">
            MARKETING AI · QUICK TASKS
          </div>
          <h1 className="mt-2 font-display text-[3rem] leading-[1.05] text-mos-ink tracking-[-0.02em]">
            AI 工具
          </h1>
          <p className="mt-3 text-[0.95rem] text-mos-body max-w-[540px] mx-auto">
            單輸入 → 30 秒交付。不用設定 squad、不用跑 mission。
            <br />
            適合臨時補刀、靈感牆、急件處理。
          </p>
        </div>
      </section>

      {/* TILE GRID */}
      <section className="max-w-[1280px] mx-auto px-8 mt-12">
        <h2 className="font-display text-[1.4rem] text-mos-ink tracking-[-0.015em] mb-5">
          選一個工具
        </h2>

        {tasksQuery.isLoading && (
          <div className="text-[0.82rem] text-mos-muted py-10">載入工具列表中…</div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {tasks.map((t) => {
            const look = TILE_LOOK[t.id] ?? { bg: "#F2F2F2", emoji: "✦" };
            return (
              <button
                key={t.id}
                onClick={() => setActiveId(t.id)}
                className="group text-left overflow-hidden rounded-2xl transition hover:shadow-[0_6px_18px_rgba(0,0,0,0.08)]"
              >
                <div
                  className="h-[160px] flex items-center justify-center"
                  style={{ background: look.bg }}
                >
                  <span className="text-[3.6rem]" aria-hidden>{look.emoji}</span>
                </div>
                <div className="px-1 pt-3 pb-1 flex items-center justify-between">
                  <span className="text-[0.92rem] text-mos-ink font-medium">
                    {t.label}
                  </span>
                  <span aria-hidden className="text-[0.78rem]" style={{ color: "#5B3CC8" }}>→</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* RUN MODAL */}
      {activeTask && (
        <RunModal
          task={activeTask}
          look={TILE_LOOK[activeTask.id]}
          onClose={() => setActiveId(null)}
        />
      )}
    </main>
  );
}

/* ───────────────────────────── modal ─────────────────────────────────── */

function RunModal({
  task, look, onClose,
}: {
  task: TaskMeta;
  look?: { bg: string; emoji: string };
  onClose: () => void;
}) {
  const [inputs, setInputs] = useState<Record<string, string | number>>(() => {
    const init: Record<string, string | number> = {};
    for (const f of task.fields) {
      if (f.default !== undefined) init[f.key] = f.default;
    }
    return init;
  });
  const [output, setOutput] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ provider: string; model: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const runMut = (trpc as any).quickTask.run.useMutation();

  const requiredOk = task.fields
    .filter((f) => f.required)
    .every((f) => {
      const v = inputs[f.key];
      return v !== undefined && String(v).trim().length > 0;
    });

  const onRun = async () => {
    setErr(null);
    setOutput(null);
    setMeta(null);
    try {
      const r = await runMut.mutateAsync({ taskId: task.id, inputs });
      setOutput(r.output);
      setMeta({ provider: r.provider, model: r.model });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  };

  const copyOut = async () => {
    if (!output) return;
    try { await navigator.clipboard.writeText(output); } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white w-[min(960px,94vw)] max-h-[92vh] overflow-y-auto rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.30)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-6 py-4 border-b border-mos-hair"
          style={{ background: look?.bg ?? "#F2F2F2" }}
        >
          <div className="flex items-center gap-3">
            <span className="text-[1.6rem]" aria-hidden>{look?.emoji ?? "✦"}</span>
            <div>
              <div className="text-[0.6rem] tracking-[0.28em] uppercase text-mos-soft">QUICK TASK</div>
              <div className="font-display text-[1.2rem] text-mos-ink tracking-[-0.01em]">{task.label}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-mos-muted hover:text-mos-ink text-[1.2rem]">×</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[400px_1fr] gap-0">
          {/* form */}
          <div className="p-6 border-r border-mos-hair space-y-4">
            {task.fields.map((f) => (
              <FieldInput
                key={f.key}
                field={f}
                value={inputs[f.key]}
                onChange={(v) => setInputs((p) => ({ ...p, [f.key]: v }))}
              />
            ))}

            <button
              onClick={onRun}
              disabled={!requiredOk || runMut.isPending}
              className="w-full mt-2 py-3 text-[0.78rem] tracking-[0.18em] uppercase rounded-full text-white disabled:opacity-50 transition"
              style={{ background: "#5B3CC8" }}
            >
              {runMut.isPending ? "生成中…" : "✦ 生成 (約 30 秒)"}
            </button>

            {err && (
              <div className="text-[0.78rem] text-mos-red bg-mos-red/5 px-3 py-2 rounded">
                {err}
              </div>
            )}
          </div>

          {/* output */}
          <div className="p-6 bg-mos-paper">
            {!output && !runMut.isPending && (
              <div className="h-full min-h-[240px] flex items-center justify-center text-[0.82rem] text-mos-muted">
                填好左邊的欄位，點生成 →
              </div>
            )}
            {runMut.isPending && (
              <div className="h-full min-h-[240px] flex flex-col items-center justify-center gap-3 text-[0.82rem] text-mos-muted">
                <div className="w-7 h-7 rounded-full border-2 border-mos-hair border-t-mos-ink animate-spin" />
                正在生成…
              </div>
            )}
            {output && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[0.6rem] tracking-[0.28em] uppercase text-mos-soft">
                    OUTPUT {meta ? `· ${meta.provider}/${meta.model}` : ""}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={copyOut} className="px-3 py-1.5 text-[0.7rem] tracking-[0.16em] uppercase border border-mos-hair text-mos-muted hover:text-mos-ink hover:border-mos-ink rounded-full transition">
                      複製
                    </button>
                    <button onClick={onRun} className="px-3 py-1.5 text-[0.7rem] tracking-[0.16em] uppercase border border-mos-hair text-mos-muted hover:text-mos-ink hover:border-mos-ink rounded-full transition">
                      再生一次
                    </button>
                  </div>
                </div>
                <pre className="whitespace-pre-wrap text-[0.92rem] leading-relaxed text-mos-ink font-sans">
                  {output}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldInput({
  field, value, onChange,
}: {
  field: TaskField;
  value: string | number | undefined;
  onChange: (v: string | number) => void;
}) {
  const v = value ?? "";

  if (field.kind === "longtext") {
    return (
      <label className="block">
        <div className="text-[0.74rem] text-mos-body mb-1.5">
          {field.label}{field.required && <span className="text-mos-red"> *</span>}
        </div>
        <textarea
          value={String(v)}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={6}
          className="w-full px-3 py-2 text-[0.86rem] bg-white border border-mos-hair rounded-lg focus:outline-none focus:border-[#5B3CC8] transition"
        />
      </label>
    );
  }

  if (field.kind === "select") {
    return (
      <label className="block">
        <div className="text-[0.74rem] text-mos-body mb-1.5">
          {field.label}{field.required && <span className="text-mos-red"> *</span>}
        </div>
        <select
          value={String(v)}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 text-[0.86rem] bg-white border border-mos-hair rounded-lg focus:outline-none focus:border-[#5B3CC8] transition"
        >
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </label>
    );
  }

  if (field.kind === "number") {
    return (
      <label className="block">
        <div className="text-[0.74rem] text-mos-body mb-1.5">
          {field.label}{field.required && <span className="text-mos-red"> *</span>}
        </div>
        <input
          type="number"
          value={String(v)}
          onChange={(e) => onChange(Number(e.target.value))}
          placeholder={field.placeholder}
          className="w-full px-3 py-2 text-[0.86rem] bg-white border border-mos-hair rounded-lg focus:outline-none focus:border-[#5B3CC8] transition"
        />
      </label>
    );
  }

  return (
    <label className="block">
      <div className="text-[0.74rem] text-mos-body mb-1.5">
        {field.label}{field.required && <span className="text-mos-red"> *</span>}
      </div>
      <input
        type={field.kind === "url" ? "url" : "text"}
        value={String(v)}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className="w-full px-3 py-2 text-[0.86rem] bg-white border border-mos-hair rounded-lg focus:outline-none focus:border-[#5B3CC8] transition"
      />
    </label>
  );
}
