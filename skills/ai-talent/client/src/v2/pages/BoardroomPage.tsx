/**
 * BoardroomPage — Shark-Tank-style multi-agent pitch arena.
 *
 * UX:
 *   1. Dark hero ("顧問團") — distinct from rest of app
 *   2. Brief input + persona picker (4 advisors)
 *   3. "召開董事會" → trpc.boardroom.run → 4 pitches in parallel
 *   4. Result: 2x2 or 4-col grid of pitch cards. User picks / merges.
 *
 * Backend lives in server/routers/boardroomRouter.ts.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";

type Persona = {
  id: string;
  name: string;
  title: string;
  bio: string;
  preferredProvider: string;
};

type Pitch = {
  personaId: string;
  name: string;
  title: string;
  bio: string;
  pitch: string;
  provider: string;
  model: string;
  error: string | null;
};

const PROVIDER_BADGE: Record<string, { label: string; bg: string }> = {
  openai:     { label: "GPT",        bg: "#0E8567" },
  google:     { label: "Gemini",     bg: "#3D7BD9" },
  perplexity: { label: "Perplexity", bg: "#1F8A9A" },
  cohere:     { label: "Cohere",     bg: "#7849C2" },
  qwen:       { label: "Qwen",       bg: "#D9893E" },
  zhipu:      { label: "Zhipu",      bg: "#A8451E" },
  forge:      { label: "Forge",      bg: "#525866" },
};

export default function BoardroomPage() {
  const { brands, brandId } = useOutletContext<ShellOutletCtx>();
  const currentBrand = useMemo(
    () => brands.find((b: any) => b.id === brandId) ?? null,
    [brands, brandId]
  );

  const personasQuery = (trpc as any).boardroom?.listPersonas?.useQuery?.(undefined, {
    refetchOnWindowFocus: false,
  }) ?? { data: [], isLoading: false };
  const personas: Persona[] = (personasQuery.data as any[]) ?? [];

  const [brief, setBrief] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [adopted, setAdopted] = useState<string[]>([]); // pitch personaIds the user "採納"

  const runMut = (trpc as any).boardroom.run.useMutation();
  const [result, setResult] = useState<{ pitches: Pitch[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Pre-select all personas once they load.
  useEffect(() => {
    if (personas.length > 0 && picked.length === 0) {
      setPicked(personas.map((p) => p.id));
    }
  }, [personas]);

  const togglePersona = (id: string) => {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const onRun = async () => {
    setErr(null);
    setResult(null);
    setAdopted([]);
    try {
      const r = await runMut.mutateAsync({
        brief,
        personaIds: picked,
        brandName: currentBrand?.name ?? undefined,
      });
      setResult({ pitches: r.pitches });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  };

  const toggleAdopt = (personaId: string) => {
    setAdopted((p) => (p.includes(personaId) ? p.filter((x) => x !== personaId) : [...p, personaId]));
  };

  const onReset = () => {
    setResult(null);
    setAdopted([]);
    setErr(null);
  };

  return (
    <main className="pb-20" style={{ background: "#FAFAF7" }}>
      {/* HERO — dark boardroom */}
      <section
        className="relative overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse at top, #2A1F4A 0%, #14102A 100%)",
        }}
      >
        <div className="max-w-[1280px] mx-auto px-8 pt-20 pb-16 text-center">
          <div className="font-display text-[0.62rem] tracking-[0.36em] uppercase" style={{ color: "#D4B36A" }}>
            STRATEGIC ADVISORY · BOARDROOM
          </div>
          <h1 className="mt-2 font-display text-[3rem] leading-[1.05] tracking-[-0.02em]" style={{ color: "#F5EFD9" }}>
            顧問團
          </h1>
          <p className="mt-3 text-[0.95rem] max-w-[600px] mx-auto" style={{ color: "#C9C2D9" }}>
            把你的 brief 交給 4 位行銷大師，請他們各自上台簡報。
            <br />
            你坐主席位，看完所有提案，採納 / 合併 / 退件。
          </p>

          {/* round table illustration */}
          <div className="mt-10 mx-auto w-[460px] h-[140px] relative" aria-hidden>
            <div
              className="absolute inset-x-0 top-3 h-[110px] rounded-[50%]"
              style={{
                background:
                  "radial-gradient(ellipse at center, #4B3D7A 0%, #2A1F4A 70%)",
                boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
              }}
            />
            {[0, 1, 2, 3].map((i) => {
              const angle = (Math.PI / 5) * (i + 0.5);
              const x = 230 + Math.cos(Math.PI - angle) * 180;
              const y = 70 + Math.sin(angle) * 35;
              return (
                <div
                  key={i}
                  className="absolute w-9 h-9 rounded-full border-2"
                  style={{
                    left: x - 18,
                    top: y - 18,
                    background: ["#D4B36A", "#9F6B4F", "#6B7CC7", "#A85A5A"][i],
                    borderColor: "#F5EFD9",
                  }}
                />
              );
            })}
          </div>
        </div>
      </section>

      {/* BODY */}
      <section className="max-w-[1280px] mx-auto px-8 -mt-10 relative z-10">
        {!result && (
          <div className="bg-white rounded-2xl shadow-[0_12px_40px_rgba(20,16,42,0.18)] p-8">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[0.74rem] text-white" style={{ background: "#14102A" }}>
                1
              </div>
              <h2 className="font-display text-[1.2rem] text-mos-ink tracking-[-0.01em]">
                今天要董事會討論什麼？
              </h2>
            </div>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="例：我們新一季想推 Z 世代咖啡，希望 6 個月內在台北開 3 家店。怎麼定位、怎麼上市、預算 800 萬。"
              rows={6}
              className="w-full px-4 py-3 text-[0.92rem] bg-mos-paper border border-mos-hair rounded-lg focus:outline-none focus:border-[#5B3CC8] transition"
            />

            <div className="flex items-center gap-3 mt-8 mb-4">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[0.74rem] text-white" style={{ background: "#14102A" }}>
                2
              </div>
              <h2 className="font-display text-[1.2rem] text-mos-ink tracking-[-0.01em]">
                想聽誰上台？
              </h2>
              <div className="text-[0.74rem] text-mos-muted ml-auto">
                {picked.length} / {personas.length} 位已選
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {personas.map((p) => {
                const active = picked.includes(p.id);
                const badge = PROVIDER_BADGE[p.preferredProvider];
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePersona(p.id)}
                    className={[
                      "text-left p-4 rounded-xl border transition flex items-start gap-3",
                      active
                        ? "border-[#14102A] bg-[#14102A]/5"
                        : "border-mos-hair bg-white hover:border-mos-ink",
                    ].join(" ")}
                  >
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white font-display shrink-0"
                      style={{ background: ["#D4B36A", "#9F6B4F", "#6B7CC7", "#A85A5A"][personas.indexOf(p) % 4] }}
                    >
                      {p.name.split(" ").map((s) => s[0]).join("").slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-display text-[1rem] text-mos-ink tracking-[-0.01em]">{p.name}</div>
                        {badge && (
                          <span
                            className="text-[0.58rem] tracking-[0.18em] uppercase px-1.5 py-0.5 rounded text-white"
                            style={{ background: badge.bg }}
                          >
                            {badge.label}
                          </span>
                        )}
                      </div>
                      <div className="text-[0.72rem] text-mos-muted">{p.title}</div>
                      <div className="mt-1 text-[0.78rem] text-mos-body line-clamp-2">{p.bio}</div>
                    </div>
                    <div className={[
                      "w-5 h-5 rounded-full border-2 shrink-0 mt-1 flex items-center justify-center",
                      active ? "bg-[#14102A] border-[#14102A]" : "border-mos-hair",
                    ].join(" ")}>
                      {active && <span className="text-white text-[0.7rem]">✓</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            {err && (
              <div className="mt-5 text-[0.84rem] text-mos-red bg-mos-red/5 px-4 py-3 rounded-lg">
                {err}
              </div>
            )}

            <button
              onClick={onRun}
              disabled={brief.trim().length < 10 || picked.length === 0 || runMut.isPending}
              className="mt-6 w-full py-3.5 text-[0.82rem] tracking-[0.22em] uppercase rounded-full text-white disabled:opacity-40 transition shadow-[0_4px_14px_rgba(20,16,42,0.30)]"
              style={{ background: "#14102A" }}
            >
              {runMut.isPending ? "顧問團審議中…" : "👑 召開董事會 (約 3 分鐘)"}
            </button>

            <div className="mt-2 text-center text-[0.7rem] text-mos-muted">
              將同時調用 {picked.length} 個 LLM 並行運算
            </div>
          </div>
        )}

        {/* RESULTS */}
        {result && (
          <div>
            <div className="flex items-end justify-between mb-5">
              <div>
                <div className="font-display text-[0.62rem] tracking-[0.28em] uppercase text-mos-soft">
                  議事廳 · BOARD MEETING
                </div>
                <h2 className="font-display text-[1.6rem] text-mos-ink tracking-[-0.015em] mt-1">
                  顧問提案
                </h2>
                <div className="mt-1 text-[0.78rem] text-mos-muted line-clamp-2 max-w-[680px]">
                  Brief：{brief}
                </div>
              </div>
              <button
                onClick={onReset}
                className="px-4 py-2 text-[0.72rem] tracking-[0.18em] uppercase border border-mos-hair text-mos-muted hover:text-mos-ink hover:border-mos-ink rounded-full transition"
              >
                ← 改 brief 重來
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
              {result.pitches.map((pitch, i) => {
                const isAdopted = adopted.includes(pitch.personaId);
                const badge = PROVIDER_BADGE[pitch.provider];
                return (
                  <article
                    key={pitch.personaId}
                    className={[
                      "bg-white rounded-2xl overflow-hidden flex flex-col transition",
                      isAdopted
                        ? "border-2 border-[#D4B36A] shadow-[0_8px_28px_rgba(212,179,106,0.30)]"
                        : "border border-mos-hair shadow-[0_4px_14px_rgba(0,0,0,0.06)]",
                    ].join(" ")}
                  >
                    <header
                      className="px-5 py-4 flex items-center gap-3"
                      style={{ background: "#14102A" }}
                    >
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-display shrink-0"
                        style={{ background: ["#D4B36A", "#9F6B4F", "#6B7CC7", "#A85A5A"][i % 4] }}
                      >
                        {pitch.name.split(" ").map((s) => s[0]).join("").slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-display text-[0.96rem]" style={{ color: "#F5EFD9" }}>
                          {pitch.name}
                        </div>
                        <div className="text-[0.66rem] truncate" style={{ color: "#C9C2D9" }}>
                          {pitch.title}
                        </div>
                      </div>
                      {badge && (
                        <span
                          className="text-[0.56rem] tracking-[0.18em] uppercase px-1.5 py-0.5 rounded text-white shrink-0"
                          style={{ background: badge.bg }}
                        >
                          {badge.label}
                        </span>
                      )}
                    </header>

                    <div className="p-5 flex-1">
                      {pitch.error ? (
                        <div className="text-[0.82rem] text-mos-red">
                          無法取得回應：{pitch.error}
                        </div>
                      ) : (
                        <pre className="whitespace-pre-wrap text-[0.84rem] leading-relaxed text-mos-ink font-sans">
                          {pitch.pitch}
                        </pre>
                      )}
                    </div>

                    <footer className="px-5 py-3 border-t border-mos-hair flex items-center gap-2 bg-mos-paper">
                      <button
                        onClick={() => toggleAdopt(pitch.personaId)}
                        className={[
                          "flex-1 py-2 text-[0.7rem] tracking-[0.18em] uppercase rounded-full transition",
                          isAdopted
                            ? "bg-[#D4B36A] text-[#14102A] font-medium"
                            : "border border-mos-hair text-mos-muted hover:text-mos-ink hover:border-mos-ink",
                        ].join(" ")}
                      >
                        {isAdopted ? "✓ 已採納" : "採納"}
                      </button>
                      <button
                        onClick={() => navigator.clipboard?.writeText?.(pitch.pitch)}
                        className="px-3 py-2 text-[0.7rem] tracking-[0.18em] uppercase border border-mos-hair text-mos-muted hover:text-mos-ink hover:border-mos-ink rounded-full transition"
                      >
                        複製
                      </button>
                    </footer>
                  </article>
                );
              })}
            </div>

            {/* Chairman actions */}
            {adopted.length > 0 && (
              <div
                className="mt-8 p-5 rounded-2xl flex items-center gap-4"
                style={{ background: "#14102A", color: "#F5EFD9" }}
              >
                <div className="flex-1">
                  <div className="font-display text-[0.62rem] tracking-[0.28em] uppercase" style={{ color: "#D4B36A" }}>
                    主席決議
                  </div>
                  <div className="mt-1 text-[0.92rem]">
                    已採納 {adopted.length} 份提案 — {adopted.map((id) => result.pitches.find((p) => p.personaId === id)?.name).filter(Boolean).join("、")}
                  </div>
                </div>
                <button
                  onClick={() => alert("匯出議事錄 PDF（即將推出）")}
                  className="px-5 py-2.5 text-[0.72rem] tracking-[0.18em] uppercase rounded-full"
                  style={{ background: "#D4B36A", color: "#14102A" }}
                >
                  匯出議事錄
                </button>
                <button
                  onClick={() => alert("存進品牌大腦（即將推出）")}
                  className="px-5 py-2.5 text-[0.72rem] tracking-[0.18em] uppercase rounded-full border"
                  style={{ borderColor: "#D4B36A", color: "#D4B36A" }}
                >
                  存進品牌大腦
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
