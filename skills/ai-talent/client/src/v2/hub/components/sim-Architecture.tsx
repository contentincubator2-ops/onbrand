/**
 * "How the rep bot is wired" — a div-built diagram with live integration status.
 * Vertical chain so it reads the same on a phone and in the right column.
 */
import React from "react";
import {
  ArrowLeftRight,
  ArrowUpDown,
  BarChart3,
  Bot,
  CheckCircle2,
  Circle,
  Compass,
  PenLine,
  Server,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { Pill, cx } from "../ui";

export interface HubIntegrations {
  line: { messaging: boolean; liff: boolean; login: boolean; liffId: string | null };
  hermes: { configured: boolean; profiles: number };
  writerModel: string;
}

function StatusPill({ ok, on, off }: { ok: boolean; on: string; off: string }) {
  return ok ? (
    <Pill tone="good">
      <CheckCircle2 className="h-3 w-3" aria-hidden />
      {on}
    </Pill>
  ) : (
    <Pill tone="neutral">
      <Circle className="h-3 w-3" aria-hidden />
      {off}
    </Pill>
  );
}

function Box({
  icon: Icon,
  title,
  subtitle,
  lines,
  pills,
  variant = "plain",
  className,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  lines: string[];
  pills?: React.ReactNode;
  variant?: "plain" | "strong" | "dashed";
  className?: string;
}) {
  return (
    <div
      className={cx(
        "min-w-0 rounded-lg p-3",
        variant === "strong" && "border border-stone-800 bg-stone-900 text-white",
        variant === "plain" && "border border-stone-200 bg-stone-50",
        variant === "dashed" && "border border-dashed border-stone-400 bg-white",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cx("h-4 w-4 shrink-0", variant === "strong" ? "text-stone-300" : "text-stone-500")} aria-hidden />
        <div className="min-w-0">
          <div className={cx("text-[13px] font-semibold leading-tight", variant === "strong" ? "text-white" : "text-stone-900")}>{title}</div>
          {subtitle ? <div className={cx("text-[11px] leading-tight", variant === "strong" ? "text-stone-400" : "text-stone-500")}>{subtitle}</div> : null}
        </div>
      </div>
      <ul className={cx("mt-2 space-y-0.5 text-[12px] leading-snug", variant === "strong" ? "text-stone-200" : "text-stone-600")}>
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      {pills ? <div className="mt-2 flex flex-wrap gap-1">{pills}</div> : null}
    </div>
  );
}

function Connector({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5 py-1 text-[11px] text-stone-500">
      <ArrowUpDown className="h-3.5 w-3.5" aria-hidden />
      {label}
    </div>
  );
}

export default function Architecture({ integrations }: { integrations?: HubIntegrations | null }) {
  const i = integrations;
  return (
    <div>
      <Box
        icon={Smartphone}
        title="Rep · LINE app"
        subtitle="The chat app reps already use"
        lines={["Rich menu (6 buttons) · chat · LIFF pages for editing and sharing"]}
        pills={
          i ? (
            <>
              <StatusPill ok={i.line.messaging} on="LINE Messaging · Connected" off="LINE Messaging · Not configured" />
              <StatusPill ok={i.line.liff} on="LIFF · Configured" off="LIFF · Not configured" />
            </>
          ) : null
        }
      />
      <Connector label="webhook events · replies" />

      <div className="grid gap-0 sm:grid-cols-[minmax(0,1.15fr)_auto_minmax(0,1fr)] sm:items-stretch sm:gap-2">
        <Box
          icon={Server}
          variant="strong"
          title="OnBrand"
          subtitle="Sales Hub backend"
          lines={["LINE webhook · identity (rep ↔ LINE user) · rich menu", "Same handlers power this simulator"]}
        />
        <div className="flex items-center justify-center gap-1.5 py-1 text-[11px] text-stone-500 sm:flex-col sm:py-0">
          <ArrowUpDown className="h-3.5 w-3.5 sm:hidden" aria-hidden />
          <ArrowLeftRight className="hidden h-3.5 w-3.5 sm:block" aria-hidden />
          <span className="sm:max-w-[64px] sm:text-center">Ask AI · MCP</span>
        </div>
        <Box
          icon={Bot}
          variant="dashed"
          title="Hermes Agent"
          subtitle="Nous Research · one profile per rep"
          lines={["Private memory per rep", "Company skills (read-only)", "Calls OnBrand via MCP with the rep's own token"]}
          pills={i ? <StatusPill ok={i.hermes.configured} on={`Configured · ${i.hermes.profiles} profile${i.hermes.profiles === 1 ? "" : "s"}`} off="Integration ready · this demo answers via OnBrand's LLM" /> : null}
        />
      </div>

      <Connector label="every answer and post draws on three layers" />

      <div className="grid gap-2 sm:grid-cols-3">
        <Box icon={Compass} title="Strategy" lines={["Solution catalog", "Approved prices", "Cited market facts"]} />
        <Box
          icon={PenLine}
          title="Content"
          lines={["Skills + policy packs", "→ compliance checker"]}
          pills={
            i ? (
              <Pill tone="neutral" title="Model that writes rep posts">
                Writer · {i.writerModel}
              </Pill>
            ) : null
          }
        />
        <Box icon={BarChart3} title="Performance" lines={["Tracked links", "API metrics", "Data grades"]} />
      </div>
    </div>
  );
}
