/**
 * BoardroomPage — Shark Tank "聽比稿" pitch arena.
 *
 * UX:
 *   1. Stage hero with spotlights — user as "主席 (Chairman)" 坐主席台
 *   2. 6 sharks 排成 panel，每位綁不同 LLM provider
 *   3. brief 輸入 → 「請各位上台簡報」→ pitches 依 pitchOrder 一個個亮燈
 *   4. 每位 shark 的提案像 pitch deck slide，採納 = "I'm in"，退件 = "I'm out"
 *
 * Reuses tone-colored PortraitAvatar (DiceBear) — same design language as /ai。
 */
import React, { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";

type Tone = "research" | "analyze" | "write" | "craft" | "orchestrate";

type Persona = {
  id: string;
  name: string;
  title: string;
  bio: string;
  pitchOrder: number;
  tone: Tone;
  preferredProvider: string;
  catchphrase: string;
};

type Pitch = {
  personaId: string;
  name: string;
  title: string;
  bio: string;
  tone: Tone;
  pitchOrder: number;
  catchphrase: string;
  pitch: string;
  provider: string;
  model: string;
  error: string | null;
};

const TONE_COLOR: Record<Tone, string> = {
  research: "#2EA4A0",
  analyze: "#3D6BCC",
  write: "#E07AAE",
  craft: "#E8A23B",
  orchestrate: "#5B3CC8",
};

const PROVIDER_BADGE: Record<string, { label: string; bg: string }> = {
  openai: { label: "GPT", bg: "#0E8567" },
  google: { label: "Gemini", bg: "#3D7BD9" },
  perplexity: { label: "Perplexity", bg: "#1F8A9A" },
  cohere: { label: "Cohere", bg: "#7849C2" },
  qwen: { label: "Qwen", bg: "#D9893E" },
  zhipu: { label: "Zhipu", bg: "#A8451E" },
  forge: { label: "Forge", bg: "#525866" },
};

const ACCENT = "#5B3CC8";
const STAGE_GOLD = "#D4B36A";

// ─── PortraitAvatar (shared design language with /ai) ───────────────────────

function PortraitAvatar({
  name,
  tone,
  size,
  pulse = false,
  glow = false,
  dim = false,
}: {
  name: string;
  tone: Tone;
  size: number;
  pulse?: boolean;
  glow?: boolean;
  dim?: boolean;
}) {
  const ringColor = TONE_COLOR[tone];
  const url = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
    name
  )}&radius=50&backgroundColor=ffffff,f5f5f5,fef9e7,e8f5e9`;
  const ringWidth = Math.max(2, Math.round(size * 0.08));
  return (
    <div
      className="relative shrink-0"
      style={{
        width: size,
        height: size,
        opacity: dim ? 0.45 : 1,
        transition: "opacity 240ms ease",
      }}
    >
      {pulse && (
        <span
          className="absolute inset-0 rounded-full animate-ping"
          style={{ background: ringColor, opacity: 0.35 }}
        />
      )}
      <div
        className="rounded-full overflow-hidden bg-white"
        style={{
          width: size,
          height: size,
          border: `${ringWidth}px solid ${ringColor}`,
          boxShadow: glow
            ? `0 0 0 2px white, 0 0 0 4px ${STAGE_GOLD}, 0 8px 22px rgba(212,179,106,0.45)`
            : "0 2px 8px rgba(0,0,0,0.18)",
        }}
      >
        <img src={url} alt={name} className="w-full h-full block" />
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function BoardroomPage() {
  const { brands, brandId } = useOutletContext<ShellOutletCtx>();
  const currentBrand = useMemo(
    () => brands.find((b: any) => b.id === brandId) ?? null,
    [brands, brandId]
  );

  const personasQuery =
    (trpc as any).boardroom?.listPersonas?.useQuery?.(undefined, {
      refetchOnWindowFocus: false,
    }) ?? { data: [], isLoading: false };
  const personas: Persona[] = (personasQuery.data as any[]) ?? [];

  const [brief, setBrief] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [adopted, setAdopted] = useState<string[]>([]);

  const runMut = (trpc as any).boardroom.run.useMutation();
  const [result, setResult] = useState<{ pitches: Pitch[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Stage entrance: which pitchOrder is currently "on mic"
  const [revealedCount, setRevealedCount] = useState(0);

  useEffect(() => {
    if (personas.length > 0 && picked.length === 0) {
      setPicked(personas.map((p) => p.id));
    }
  }, [personas]);

  // Once result lands, stagger reveal one by one (for Shark Tank drama)
  useEffect(() => {
    if (!result) {
      setRevealedCount(0);
      return;
    }
    setRevealedCount(0);
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      setRevealedCount(i);
      if (i >= result.pitches.length) clearInterval(interval);
    }, 700);
    return () => clearInterval(interval);
  }, [result]);

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
    setAdopted((p) =>
      p.includes(personaId) ? p.filter((x) => x !== personaId) : [...p, personaId]
    );
  };

  const onReset = () => {
    setResult(null);
    setAdopted([]);
    setErr(null);
  };

  return (
    <main className="pb-20" style={{ background: "#0A0813" }}>
      {/* HERO — Shark Tank stage */}
      <section
        className="relative overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, #2A1F4A 0%, #14102A 55%, #0A0813 100%)",
        }}
      >
        {/* spotlights */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: "20%",
            top: "-10%",
            width: "30%",
            height: "70%",
            background:
              "radial-gradient(ellipse at center top, rgba(212,179,106,0.18) 0%, transparent 60%)",
            filter: "blur(20px)",
          }}
        />
        <div
          className="absolute pointer-events-none"
          style={{
            right: "20%",
            top: "-10%",
            width: "30%",
            height: "70%",
            background:
              "radial-gradient(ellipse at center top, rgba(91,60,200,0.20) 0%, transparent 60%)",
            filter: "blur(20px)",
          }}
        />

        <div className="relative max-w-[1280px] mx-auto px-8 pt-16 pb-12 text-center">
          <div
            className="font-display text-[0.62rem] tracking-[0.36em] uppercase"
            style={{ color: STAGE_GOLD }}
          >
            SHARK TANK · PITCH ARENA
          </div>
          <h1
            className="mt-2 font-display text-[3.2rem] leading-[1.05] tracking-[-0.02em]"
            style={{ color: "#F5EFD9" }}
          >
            聽比稿
          </h1>
          <p
            className="mt-3 text-[0.95rem] max-w-[640px] mx-auto"
            style={{ color: "#C9C2D9" }}
          >
            你坐主席台。6 位行銷大師輪流上台簡報，每位綁定不同 LLM。
            <br />
            一個個聽完 — 喊「I'm in」收下，「I'm out」退件。
          </p>

          {/* Stage with chairman + sharks */}
          <div className="mt-12 mx-auto max-w-[860px]">
            {/* Chairman */}
            <div className="flex flex-col items-center mb-8">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-[1.5rem]"
                style={{
                  background: "linear-gradient(135deg, #D4B36A 0%, #B58A3D 100%)",
                  boxShadow: "0 8px 24px rgba(212,179,106,0.45)",
                }}
              >
                👑
              </div>
              <div
                className="mt-2 font-display text-[0.62rem] tracking-[0.28em] uppercase"
                style={{ color: STAGE_GOLD }}
              >
                CHAIRMAN · 主席
              </div>
              <div
                className="text-[0.84rem]"
                style={{ color: "#F5EFD9" }}
              >
                {currentBrand?.name ?? "你"}
              </div>
            </div>

            {/* Sharks panel — arc layout */}
            <div className="flex justify-center items-end gap-4 flex-wrap">
              {personas.map((p) => {
                const onMic =
                  result &&
                  revealedCount > 0 &&
                  result.pitches[revealedCount - 1]?.personaId === p.id;
                const alreadyPitched =
                  result &&
                  result.pitches.findIndex((x) => x.personaId === p.id) <
                    revealedCount - 1;
                const queued = !result || (!onMic && !alreadyPitched);
                return (
                  <div
                    key={p.id}
                    className="flex flex-col items-center"
                    style={{ width: 96 }}
                  >
                    <PortraitAvatar
                      name={p.name}
                      tone={p.tone}
                      size={64}
                      pulse={!!onMic}
                      glow={!!onMic}
                      dim={result ? !onMic && !alreadyPitched : false}
                    />
                    <div
                      className="mt-2 font-display text-[0.78rem] text-center leading-tight"
                      style={{ color: "#F5EFD9" }}
                    >
                      {p.name}
                    </div>
                    <div
                      className="text-[0.6rem] tracking-[0.14em] uppercase"
                      style={{
                        color:
                          PROVIDER_BADGE[p.preferredProvider]?.bg ?? "#999",
                      }}
                    >
                      {PROVIDER_BADGE[p.preferredProvider]?.label ?? p.preferredProvider}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* BODY */}
      <section className="max-w-[1280px] mx-auto px-8 -mt-6 relative z-10">
        {!result && (
          <div
            className="rounded-2xl p-8"
            style={{
              background: "#fff",
              boxShadow: "0 18px 60px rgba(20,16,42,0.42)",
            }}
          >
            <div className="flex items-center gap-3 mb-5">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[0.74rem] text-white"
                style={{ background: "#14102A" }}
              >
                1
              </div>
              <h2 className="font-display text-[1.2rem] text-mos-ink tracking-[-0.01em]">
                今天要 sharks 評什麼？
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
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[0.74rem] text-white"
                style={{ background: "#14102A" }}
              >
                2
              </div>
              <h2 className="font-display text-[1.2rem] text-mos-ink tracking-[-0.01em]">
                點名上台的 sharks
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
                    <PortraitAvatar name={p.name} tone={p.tone} size={48} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-display text-[1rem] text-mos-ink tracking-[-0.01em]">
                          {p.name}
                        </div>
                        {badge && (
                          <span
                            className="text-[0.58rem] tracking-[0.18em] uppercase px-1.5 py-0.5 rounded text-white"
                            style={{ background: badge.bg }}
                          >
                            {badge.label}
                          </span>
                        )}
                      </div>
                      <div className="text-[0.72rem] text-mos-muted">
                        {p.title}
                      </div>
                      <div className="mt-1 text-[0.78rem] text-mos-body line-clamp-2">
                        {p.bio}
                      </div>
                      <div
                        className="mt-1.5 text-[0.72rem] italic"
                        style={{ color: TONE_COLOR[p.tone] }}
                      >
                        「{p.catchphrase}」
                      </div>
                    </div>
                    <div
                      className={[
                        "w-5 h-5 rounded-full border-2 shrink-0 mt-1 flex items-center justify-center",
                        active
                          ? "bg-[#14102A] border-[#14102A]"
                          : "border-mos-hair",
                      ].join(" ")}
                    >
                      {active && (
                        <span className="text-white text-[0.7rem]">✓</span>
                      )}
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
              disabled={
                brief.trim().length < 10 ||
                picked.length === 0 ||
                runMut.isPending
              }
              className="mt-6 w-full py-3.5 text-[0.82rem] tracking-[0.22em] uppercase rounded-full text-white disabled:opacity-40 transition"
              style={{
                background: "#14102A",
                boxShadow: "0 6px 20px rgba(20,16,42,0.40)",
              }}
            >
              {runMut.isPending ? "Sharks 上台簡報中…" : "🎤 請各位 sharks 上台"}
            </button>

            <div className="mt-2 text-center text-[0.7rem] text-mos-muted">
              將同時調用 {picked.length} 個不同 LLM 並行運算 · 約 60 秒
            </div>
          </div>
        )}

        {/* RESULTS */}
        {result && (
          <div>
            <div className="flex items-end justify-between mb-5 pt-4">
              <div>
                <div
                  className="font-display text-[0.62rem] tracking-[0.28em] uppercase"
                  style={{ color: STAGE_GOLD }}
                >
                  比稿現場 · LIVE PITCHES
                </div>
                <h2
                  className="font-display text-[1.6rem] tracking-[-0.015em] mt-1"
                  style={{ color: "#F5EFD9" }}
                >
                  Sharks 提案
                </h2>
                <div
                  className="mt-1 text-[0.78rem] line-clamp-2 max-w-[680px]"
                  style={{ color: "#C9C2D9" }}
                >
                  Brief：{brief}
                </div>
              </div>
              <button
                onClick={onReset}
                className="px-4 py-2 text-[0.72rem] tracking-[0.18em] uppercase border rounded-full transition"
                style={{
                  borderColor: "rgba(245,239,217,0.3)",
                  color: "#C9C2D9",
                }}
              >
                ← 改 brief 重來
              </button>
            </div>

            <div className="space-y-5">
              {result.pitches.map((pitch, i) => {
                const isAdopted = adopted.includes(pitch.personaId);
                const badge = PROVIDER_BADGE[pitch.provider];
                const visible = i < revealedCount;
                const isOnMic = i === revealedCount - 1;
                return (
                  <article
                    key={pitch.personaId}
                    className="rounded-2xl overflow-hidden flex transition-all duration-500"
                    style={{
                      opacity: visible ? 1 : 0,
                      transform: visible
                        ? "translateY(0)"
                        : "translateY(16px)",
                      pointerEvents: visible ? "auto" : "none",
                      background: "#FFFFFF",
                      border: isAdopted
                        ? `2px solid ${STAGE_GOLD}`
                        : isOnMic
                        ? `2px solid ${ACCENT}`
                        : "1px solid #E5E5E5",
                      boxShadow: isAdopted
                        ? "0 12px 36px rgba(212,179,106,0.35)"
                        : isOnMic
                        ? "0 12px 36px rgba(91,60,200,0.25)"
                        : "0 6px 20px rgba(0,0,0,0.18)",
                    }}
                  >
                    {/* Left rail — speaker portrait + nameplate */}
                    <div
                      className="px-6 py-6 flex flex-col items-center text-center shrink-0"
                      style={{
                        background: "#14102A",
                        width: 200,
                        color: "#F5EFD9",
                      }}
                    >
                      <div
                        className="font-display text-[0.55rem] tracking-[0.28em] uppercase mb-3"
                        style={{ color: STAGE_GOLD }}
                      >
                        Pitch #{pitch.pitchOrder}
                      </div>
                      <PortraitAvatar
                        name={pitch.name}
                        tone={pitch.tone}
                        size={84}
                        glow={isAdopted}
                        pulse={isOnMic}
                      />
                      <div className="mt-3 font-display text-[1rem] tracking-[-0.01em]">
                        {pitch.name}
                      </div>
                      <div
                        className="text-[0.66rem] mt-0.5"
                        style={{ color: "#C9C2D9" }}
                      >
                        {pitch.title}
                      </div>
                      {badge && (
                        <span
                          className="mt-3 text-[0.56rem] tracking-[0.18em] uppercase px-2 py-0.5 rounded text-white"
                          style={{ background: badge.bg }}
                        >
                          {badge.label}
                        </span>
                      )}
                      <div
                        className="mt-3 text-[0.7rem] italic leading-snug"
                        style={{ color: TONE_COLOR[pitch.tone] }}
                      >
                        「{pitch.catchphrase}」
                      </div>
                    </div>

                    {/* Pitch deck */}
                    <div className="flex-1 flex flex-col">
                      <div className="px-6 py-5 flex-1">
                        {pitch.error ? (
                          <div className="text-[0.84rem] text-mos-red bg-mos-red/5 px-4 py-3 rounded-lg">
                            這位 shark 沒能上台：{pitch.error}
                          </div>
                        ) : (
                          <pre className="whitespace-pre-wrap text-[0.88rem] leading-relaxed text-mos-ink font-sans">
                            {pitch.pitch}
                          </pre>
                        )}
                      </div>

                      <footer className="px-6 py-3 border-t border-mos-hair flex items-center gap-3 bg-mos-paper">
                        <button
                          onClick={() => toggleAdopt(pitch.personaId)}
                          disabled={!!pitch.error}
                          className={[
                            "px-5 py-2 text-[0.72rem] tracking-[0.18em] uppercase rounded-full transition disabled:opacity-30",
                          ].join(" ")}
                          style={
                            isAdopted
                              ? {
                                  background: STAGE_GOLD,
                                  color: "#14102A",
                                  fontWeight: 500,
                                }
                              : {
                                  background: "#14102A",
                                  color: "#F5EFD9",
                                }
                          }
                        >
                          {isAdopted ? "✓ I'm in" : "I'm in"}
                        </button>
                        <button
                          onClick={() =>
                            adopted.includes(pitch.personaId) &&
                            toggleAdopt(pitch.personaId)
                          }
                          className="px-5 py-2 text-[0.72rem] tracking-[0.18em] uppercase border border-mos-hair text-mos-muted hover:text-mos-ink hover:border-mos-ink rounded-full transition"
                        >
                          I'm out
                        </button>
                        <div className="flex-1" />
                        <button
                          onClick={() =>
                            navigator.clipboard?.writeText?.(pitch.pitch)
                          }
                          className="px-3 py-2 text-[0.7rem] tracking-[0.18em] uppercase border border-mos-hair text-mos-muted hover:text-mos-ink hover:border-mos-ink rounded-full transition"
                        >
                          複製
                        </button>
                      </footer>
                    </div>
                  </article>
                );
              })}
            </div>

            {revealedCount < result.pitches.length && (
              <div
                className="mt-6 text-center text-[0.74rem] tracking-[0.18em] uppercase"
                style={{ color: STAGE_GOLD }}
              >
                下一位 shark 準備上台… ({revealedCount}/{result.pitches.length})
              </div>
            )}

            {/* Chairman ruling */}
            {revealedCount >= result.pitches.length && adopted.length > 0 && (
              <div
                className="mt-8 p-6 rounded-2xl flex items-center gap-4"
                style={{
                  background:
                    "linear-gradient(135deg, #14102A 0%, #2A1F4A 100%)",
                  color: "#F5EFD9",
                  border: `1px solid ${STAGE_GOLD}`,
                }}
              >
                <div className="text-[2rem]">👑</div>
                <div className="flex-1">
                  <div
                    className="font-display text-[0.62rem] tracking-[0.28em] uppercase"
                    style={{ color: STAGE_GOLD }}
                  >
                    主席決議 · CHAIRMAN'S RULING
                  </div>
                  <div className="mt-1 text-[0.92rem]">
                    收下 {adopted.length} 位 sharks —{" "}
                    {adopted
                      .map(
                        (id) =>
                          result.pitches.find((p) => p.personaId === id)?.name
                      )
                      .filter(Boolean)
                      .join("、")}
                  </div>
                </div>
                <button
                  onClick={() => alert("匯出比稿紀錄 PDF（即將推出）")}
                  className="px-5 py-2.5 text-[0.72rem] tracking-[0.18em] uppercase rounded-full"
                  style={{ background: STAGE_GOLD, color: "#14102A" }}
                >
                  匯出比稿紀錄
                </button>
                <button
                  onClick={() => alert("存進品牌大腦（即將推出）")}
                  className="px-5 py-2.5 text-[0.72rem] tracking-[0.18em] uppercase rounded-full border"
                  style={{ borderColor: STAGE_GOLD, color: STAGE_GOLD }}
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
