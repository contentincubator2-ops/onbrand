/**
 * Strategy page — shared types and formatting helpers.
 * Types are inferred from the hub router (type-only import, no server code ships).
 */
import React from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { ExternalLink } from "lucide-react";
import type { AppRouter } from "../../../../../server/routers";
import { cx } from "../ui";

type Outputs = inferRouterOutputs<AppRouter>;
export type StrategyData = Outputs["hub"]["admin"]["strategy"];
export type Solution = StrategyData["solutions"][number];
export type Price = Solution["prices"][number];
export type Fact = StrategyData["facts"][number];

export type Lang = "en" | "zh";
export type Localized = { en: string; zh: string };

/** `positioning` is untyped JSON on the server; this mirrors hubSeedData.ts. */
export interface Positioning {
  oneLiner?: Localized;
  audience?: Localized;
  pains?: Localized[];
  howItWorks?: Localized[];
  pillars?: Localized[];
  voice?: Localized;
  proofPoints?: Array<Localized & { source?: string }>;
  sources?: string[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * "2026-09-15" → "Sep 15, 2026". Also tolerates the "Tue Sep 15" form the
 * store currently emits (String(Date).slice(0, 10) drops the year): the year
 * is recovered only when the weekday matches this year or last year.
 */
export function formatDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return `${MONTHS[Number(iso[2]) - 1]} ${Number(iso[3])}, ${iso[1]}`;
  const short = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) ([A-Z][a-z]{2}) (\d{1,2})$/.exec(value.trim());
  if (short) {
    const month = MONTHS.indexOf(short[2]);
    const day = Number(short[3]);
    const dow = WEEKDAYS.indexOf(short[1]);
    if (month >= 0) {
      const thisYear = new Date().getFullYear();
      for (const y of [thisYear, thisYear - 1]) {
        if (new Date(y, month, day).getDay() === dow) return `${short[2]} ${day}, ${y}`;
      }
      return `${short[2]} ${day}`;
    }
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "NT$1,065 / month · starting at", "Custom quote", "NT$5,500 one-time". */
export function priceLabel(p: Price): string {
  if (p.amount == null || p.billing === "quote") return "Custom quote";
  const currency = p.currency === "TWD" ? "NT$" : `${p.currency} `;
  const amount = `${currency}${Number(p.amount).toLocaleString("en-US")}`;
  const base = p.billing === "one_time" ? `${amount} one-time` : `${amount} / ${p.billing}`;
  return p.startsFrom ? `${base} · starting at` : base;
}

const CATEGORIES: Record<string, string> = {
  sales_crm: "Sales & CRM",
  it_devices: "IT devices",
  ai_ops: "AI operations",
  workflow_forms: "Workflow & forms",
  ecommerce_ordering: "Ordering & e-commerce",
  retail_pos: "Retail POS",
  marketing: "Marketing",
  manufacturing: "Manufacturing",
};

export function categoryLabel(id: string): string {
  if (CATEGORIES[id]) return CATEGORIES[id];
  const words = id.replace(/[_-]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : id;
}

export function FieldLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("text-[11px] font-medium uppercase tracking-wide text-stone-500", className)}>{children}</div>;
}

export function ExtLink({ href, children, className, label }: { href: string; children?: React.ReactNode; className?: string; label?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label ?? href}
      className={cx("inline-flex items-center gap-1 text-stone-600 underline-offset-2 hover:text-stone-900 hover:underline", className)}
    >
      {children}
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
    </a>
  );
}
