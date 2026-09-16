import React, { useState } from "react";
import { AlertTriangle, ChevronDown, KeyRound } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../../server/routers";
import { trpc } from "../../../lib/trpc";
import { Avatar, DemoTag, ErrorNote, cx } from "../ui";
import { CopyButton } from "./reps-CopyButton";

export type RepRow = inferRouterOutputs<AppRouter>["hub"]["admin"]["reps"][number];

/** Advanced: per-rep bearer token for a Hermes Agent profile calling OnBrand's MCP endpoint. */
export default function HermesTokens({ reps }: { reps: RepRow[] }) {
  const utils = trpc.useUtils();
  const [revealed, setRevealed] = useState<{ repId: number; token: string } | null>(null);
  const issue = trpc.hub.admin.issueMcpToken.useMutation({
    onSuccess: (data, vars) => {
      setRevealed({ repId: vars.repId, token: data.token });
      void utils.hub.admin.reps.invalidate();
    },
  });
  const endpoint = typeof window !== "undefined" ? `${window.location.origin}/mcp` : "/mcp";

  function onIssue(r: RepRow) {
    if (r.hasMcpToken && !window.confirm(`Issue a new token for ${r.name}? Their current Hermes token stops working immediately.`)) return;
    setRevealed(null);
    issue.mutate({ repId: Number(r.id) });
  }

  return (
    <details className="group rounded-xl border border-stone-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-[15px] font-semibold text-stone-900">
            <KeyRound className="h-4 w-4 text-stone-500" aria-hidden />
            Advanced: Hermes Agent profile tokens
          </span>
          <span className="mt-0.5 block text-[13px] text-stone-500">For reps who run their own Hermes Agent instead of, or alongside, the LINE bot.</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-stone-400 transition-transform group-open:rotate-180" aria-hidden />
      </summary>

      <div className="space-y-4 border-t border-stone-100 px-5 py-4">
        <p className="max-w-3xl text-[13px] leading-relaxed text-stone-600">
          A token is the credential a rep's Hermes Agent profile uses to call OnBrand's MCP endpoint at{" "}
          <code className="break-all rounded bg-stone-100 px-1 py-0.5 font-mono text-[12px] text-stone-800">{endpoint}</code>. It acts
          as that one rep: the same approved solutions, cited facts and policy checks as the LINE bot. OnBrand stores only a hash, and
          issuing a new token revokes the old one.
        </p>

        <ErrorNote error={issue.error} />

        <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
          {reps.map((r) => {
            const pending = issue.isPending && issue.variables?.repId === r.id;
            const shown = revealed && revealed.repId === Number(r.id) ? revealed.token : null;
            return (
              <li key={r.id} className="px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={String(r.name)} seed={r.avatarSeed ? String(r.avatarSeed) : undefined} size={26} />
                    <span className="truncate text-[13px] font-medium text-stone-900">{r.name}</span>
                    {r.isDemo ? <DemoTag /> : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[12px] text-stone-500">{r.hasMcpToken ? "Token active" : "No token"}</span>
                    <button
                      type="button"
                      onClick={() => onIssue(r)}
                      disabled={issue.isPending}
                      className={cx(
                        "inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-stone-700 hover:bg-stone-50",
                        issue.isPending && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <KeyRound className="h-3.5 w-3.5" aria-hidden />
                      {pending ? "Issuing…" : r.hasMcpToken ? "Reissue token" : "Hermes Agent profile token"}
                    </button>
                  </div>
                </div>

                {shown ? (
                  <div className="mt-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div className="flex items-start gap-1.5 text-[12px] font-medium text-amber-900">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      Shown once. Copy it now — it can't be displayed again.
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <input
                        readOnly
                        value={shown}
                        aria-label={`Hermes token for ${r.name}`}
                        onFocus={(e) => e.currentTarget.select()}
                        className="min-w-0 flex-1 basis-56 rounded-md border border-stone-200 bg-white px-2 py-1.5 font-mono text-[12px] text-stone-800"
                      />
                      <CopyButton text={shown} label="Copy token" />
                      <button
                        type="button"
                        onClick={() => setRevealed(null)}
                        className="rounded-md px-2.5 py-1.5 text-[12px] font-medium text-stone-600 hover:bg-amber-100"
                      >
                        Hide
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
