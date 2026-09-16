/**
 * Sales Hub — shared UI primitives.
 *
 * Design system: Notion discipline. Neutral surfaces and ink; color is
 * functional only — status (compliance verdicts) and data identity (grades).
 * Status always ships with an icon + label, never color alone.
 */
import React from "react";
import { CheckCircle2, ShieldCheck, AlertTriangle, Circle, Info } from "lucide-react";

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

/** Data grades (dataviz reference palette, slots 1–3 + neutral for tracked). */
export const GRADE = {
  verified: { label: "Verified", hint: "Platform API (LinkedIn, Instagram)", color: "#2a78d6" },
  estimated: { label: "Estimated", hint: "Network size × typical rate — no API exists", color: "#eb6834" },
  self_reported: { label: "Self-reported", hint: "Rep pasted the post URL / numbers", color: "#1baf7a" },
  tracked: { label: "Tracked", hint: "Our short-link redirect", color: "#52514e" },
} as const;
export type GradeKey = keyof typeof GRADE;

export function Card({ children, className, pad = true }: { children: React.ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx("rounded-xl border border-stone-200 bg-white", pad && "p-5", className)}>
      {children}
    </section>
  );
}

export function SectionTitle({ title, hint, right }: { title: string; hint?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-[15px] font-semibold text-stone-900">{title}</h2>
        {hint ? <p className="mt-0.5 text-[13px] text-stone-500">{hint}</p> : null}
      </div>
      {right}
    </div>
  );
}

export function PageHeader({ eyebrow, title, subtitle, right }: { eyebrow: string; title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[12px] font-medium uppercase tracking-wide text-stone-500">{eyebrow}</div>
        <h1 className="mt-1 text-[26px] font-semibold leading-tight text-stone-900">{title}</h1>
        {subtitle ? <p className="mt-1.5 max-w-3xl text-[14px] text-stone-600">{subtitle}</p> : null}
      </div>
      {right}
    </header>
  );
}

export function Stat({ label, value, sub, badge }: { label: string; value: React.ReactNode; sub?: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <Card className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[12px] font-medium text-stone-500">{label}</div>
        {badge}
      </div>
      <div className="mt-2 text-[28px] font-semibold tabular-nums leading-none text-stone-900">{value}</div>
      {sub ? <div className="mt-2 text-[12px] text-stone-500">{sub}</div> : null}
    </Card>
  );
}

export function Pill({ children, tone = "neutral", title }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "live" | "info"; title?: string }) {
  const tones: Record<string, string> = {
    neutral: "bg-stone-100 text-stone-700 border-stone-200",
    good: "bg-emerald-50 text-emerald-800 border-emerald-200",
    warn: "bg-amber-50 text-amber-800 border-amber-200",
    bad: "bg-red-50 text-red-800 border-red-200",
    live: "bg-red-600 text-white border-red-600",
    info: "bg-sky-50 text-sky-800 border-sky-200",
  };
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function LiveDot() {
  return (
    <span className="relative inline-flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-red-600" />
    </span>
  );
}

export function DemoTag() {
  return <Pill tone="neutral" title="Illustrative data generated for this concept demo">Demo data</Pill>;
}

export type Verdict = "clean" | "auto_fixed" | "needs_review";

export function VerdictBadge({ verdict, caught }: { verdict: Verdict; caught?: number }) {
  if (verdict === "clean") return <Pill tone="good"><CheckCircle2 className="h-3 w-3" aria-hidden />Compliant</Pill>;
  if (verdict === "auto_fixed") return <Pill tone="info"><ShieldCheck className="h-3 w-3" aria-hidden />Auto-fixed{caught ? ` · ${caught}` : ""}</Pill>;
  return <Pill tone="warn"><AlertTriangle className="h-3 w-3" aria-hidden />Needs review</Pill>;
}

export function CheckIcon({ status }: { status: "pass" | "fixed" | "flagged" }) {
  if (status === "pass") return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-label="passed" />;
  if (status === "fixed") return <ShieldCheck className="h-4 w-4 shrink-0 text-sky-700" aria-label="fixed" />;
  return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-label="flagged" />;
}

export function GradeSwatch({ grade }: { grade: GradeKey }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: GRADE[grade].color }} aria-hidden />;
}

export function GradeBadge({ grade }: { grade: GradeKey }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-stone-700" title={GRADE[grade].hint}>
      <GradeSwatch grade={grade} />
      {GRADE[grade].label}
    </span>
  );
}

const AVATAR_TONES = ["bg-stone-800", "bg-stone-700", "bg-stone-600", "bg-zinc-700", "bg-neutral-700"];
export function Avatar({ name, seed, size = 32 }: { name: string; seed?: string; size?: number }) {
  const latin = name.match(/[A-Za-z][A-Za-z]+(?:\s+[A-Za-z]+)?/)?.[0] ?? name;
  const initials = latin.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  const tone = AVATAR_TONES[(seed ?? name).split("").reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white", tone)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function ChannelLabel({ channel }: { channel: string }) {
  const names: Record<string, string> = { linkedin: "LinkedIn", facebook: "Facebook", instagram: "Instagram", line: "LINE" };
  return <span className="text-[12px] font-medium text-stone-700">{names[channel] ?? channel}</span>;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-[13px] text-stone-500">
      <Circle className="h-3 w-3 animate-pulse" aria-hidden /> {label}
    </div>
  );
}

export function ErrorNote({ error }: { error: { message?: string } | null | undefined }) {
  if (!error) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-800">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{error.message ?? "Something went wrong."}</span>
    </div>
  );
}

export const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-US");

export function timeAgo(value: string | Date): string {
  const t = new Date(value).getTime();
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
