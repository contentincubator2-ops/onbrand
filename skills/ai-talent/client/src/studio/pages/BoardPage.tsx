/**
 * BoardPage (画面 6) — Task Progress Board.
 *
 * Columns: Draft · Recommended · Approved · Stale.
 * Each card links back to its Studio session.
 */

import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import StudioLayout from "../StudioLayout";
import { trpc } from "../../lib/trpc";
import type { MosAccent } from "../primitives/tokens";
import { ACCENTS, accentForIndex } from "../primitives/tokens";

const COLS: Array<{ key: "draft" | "recommended" | "approved" | "stale"; label: string }> = [
  { key: "draft", label: "Draft" },
  { key: "recommended", label: "Recommended" },
  { key: "approved", label: "Approved" },
  { key: "stale", label: "Stale" },
];

export default function BoardPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const navigate = useNavigate();
  const q = trpc.board.columns.useQuery(
    { brandId: Number(brandId) },
    { enabled: !!brandId, refetchInterval: 10_000 }
  );

  const data: any = q.data ?? { draft: [], recommended: [], approved: [], stale: [] };

  return (
    <StudioLayout title="Task Board">
      <div className="grid grid-cols-4 gap-px bg-divider border border-divider min-h-[640px]">
        {COLS.map((c) => {
          const rows: any[] = data[c.key] ?? [];
          return (
            <div key={c.key} className="bg-background flex flex-col">
              <div className="px-5 py-4 border-b border-divider flex items-center justify-between bg-white">
                <div className="mos-eyebrow">{c.label}</div>
                <div className="text-meta text-default-500">{rows.length}</div>
              </div>
              <div className="p-3 space-y-3 overflow-y-auto">
                {rows.map((r: any, i: number) => {
                  const accent: MosAccent = accentForIndex(i);
                  const tone = ACCENTS[accent];
                  return (
                    <button
                      key={r.id}
                      onClick={() => navigate(`/studio/${brandId}/session/${r.squadId ?? "new"}`)}
                      className="group w-full bg-white border border-divider text-left"
                    >
                      <div className="h-1" style={{ background: tone.bg }} />
                      <div className="p-3">
                        <div className="mos-eyebrow mb-1">{r.decisionType}</div>
                        <div className="text-[0.92rem] text-foreground leading-snug mb-2">
                          {r.title ?? r.squadName ?? "Untitled"}
                        </div>
                        <div className="flex items-center justify-between text-meta text-default-500">
                          <span>{r.squadName ?? "—"}</span>
                          {typeof r.auditScore === "number" && (
                            <span>Audit {r.auditScore}</span>
                          )}
                        </div>
                        {r.mentionCount > 0 && (
                          <div className="mt-2 text-meta uppercase tracking-[0.14em] text-foreground">
                            Waiting on {r.mentionCount} mention{r.mentionCount > 1 ? "s" : ""}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
                {!rows.length && (
                  <div className="text-meta text-default-500 text-center py-8">—</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </StudioLayout>
  );
}
