/**
 * PublishGatePage (画面 4) — 3-stage gate: draft → audit → human confirm.
 *
 * Right column shows AuditAgent scores (5 dimensions). "Generate Image"
 * calls gpt-image-1 with brand context injected.
 */

import React, { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import StudioLayout from "../StudioLayout";
import type { MosAccent } from "../primitives/tokens";
import { ACCENTS } from "../primitives/tokens";
import { trpc } from "../../lib/trpc";

type Channel = "fb" | "ig";

interface LocationState {
  decisionId?: number;
  upstream?: number[];
  accent?: MosAccent;
}

// Seed drafts (would come from channel squad output).
const SEED_DRAFTS: Record<Channel, Array<{ kind: string; body: string }>> = {
  fb: [
    {
      kind: "Jab 1",
      body:
        "下午三點，茶壺剛冒第一縷蒸氣。不是為了客戶，不是為了會議。只是為了你自己──記得那個會思考的自己。\n\n#午後儀式 #LushTea",
    },
    {
      kind: "Jab 2",
      body:
        "有些事情不用效率。倒茶的手，記得你放慢的樣子。\n\n#LushTea #慢生活",
    },
    {
      kind: "Hook",
      body:
        "這週的忙碌，配一壺茶。本週新到的阿薩姆金芽，現在訂享 85 折 →\n\n#LushTea",
    },
  ],
  ig: [],
};

export default function PublishGatePage() {
  const { brandId } = useParams<{ brandId: string }>();
  const navigate = useNavigate();
  const loc = useLocation();
  const state = (loc.state as LocationState | null) ?? null;
  const accent: MosAccent = state?.accent ?? "red";
  const tone = ACCENTS[accent];

  const [channel, setChannel] = useState<Channel>("fb");
  const [alsoIG, setAlsoIG] = useState(false);
  const [alsoLI, setAlsoLI] = useState(false);
  const [schedule, setSchedule] = useState(false);

  const drafts = SEED_DRAFTS[channel];
  const [audit, setAudit] = useState<any>(null);
  const [imagesByDraft, setImagesByDraft] = useState<Record<number, { url?: string; b64?: string; loading?: boolean; error?: string }>>({});

  const scoreMut = trpc.audit.score.useMutation({ onSuccess: (d) => setAudit(d) });
  const imgMut = trpc.image.generate.useMutation();

  useEffect(() => {
    if (!brandId || !drafts.length) return;
    // Score the lead Jab on arrival
    scoreMut.mutate({
      brandId: Number(brandId),
      draftContent: drafts[0].body,
      channel,
      upstreamDecisionIds: state?.upstream ?? [],
      downstreamDecisionId: state?.decisionId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  const genImage = async (idx: number) => {
    if (!brandId) return;
    setImagesByDraft((m) => ({ ...m, [idx]: { loading: true } }));
    try {
      const res = await imgMut.mutateAsync({
        brandId: Number(brandId),
        prompt: drafts[idx].body.slice(0, 400),
        channel,
        decisionId: state?.decisionId,
        upstreamDecisionId: state?.upstream?.[0],
      });
      setImagesByDraft((m) => ({
        ...m,
        [idx]: { url: res.url ?? undefined, b64: res.b64 ?? undefined },
      }));
    } catch (e: any) {
      setImagesByDraft((m) => ({ ...m, [idx]: { error: e?.message ?? "failed" } }));
    }
  };

  return (
    <StudioLayout
      hideSubNav
      back={{ to: `/studio/${brandId}/session/new`, label: "Back to Step" }}
      title="Publish Gate"
      actions={
        <div className="flex gap-px bg-mos-hair border border-mos-hair">
          {(["fb", "ig"] as Channel[]).map((c) => (
            <button
              key={c}
              onClick={() => setChannel(c)}
              className={[
                "px-5 py-2 text-meta uppercase tracking-[0.18em]",
                channel === c ? "bg-mos-ink text-white" : "bg-white text-mos-body",
              ].join(" ")}
            >
              {c.toUpperCase()}
            </button>
          ))}
        </div>
      }
    >
      <div className="grid grid-cols-[1fr_360px] gap-8">
        {/* Left — drafts */}
        <div className="space-y-6">
          {drafts.length === 0 && (
            <div className="border border-dashed border-mos-hair p-12 text-center text-meta text-mos-muted">
              No drafts for {channel.toUpperCase()} yet.
            </div>
          )}
          {drafts.map((d, i) => {
            const imgState = imagesByDraft[i] ?? {};
            return (
              <div key={i} className="border border-mos-hair bg-white">
                <div className="px-5 py-3 border-b border-mos-hair flex items-center justify-between">
                  <div className="mos-eyebrow" style={{ color: tone.text }}>
                    {d.kind}
                  </div>
                  <div className="flex gap-2 text-meta uppercase tracking-[0.16em] text-mos-muted">
                    <button className="hover:text-mos-ink">Revise</button>
                    <span>·</span>
                    <button className="hover:text-mos-ink">Style</button>
                    <span>·</span>
                    <button
                      onClick={() => genImage(i)}
                      className="hover:text-mos-ink"
                    >
                      {imgState.loading ? "Generating…" : "Generate Image"}
                    </button>
                  </div>
                </div>
                <div className="px-5 py-5 text-[0.94rem] text-mos-body whitespace-pre-wrap leading-relaxed">
                  {d.body}
                </div>
                {(imgState.url || imgState.b64) && (
                  <div className="border-t border-mos-hair p-4 bg-mos-paper">
                    <img
                      src={imgState.url ?? `data:image/png;base64,${imgState.b64}`}
                      alt=""
                      className="max-w-full max-h-[360px] mx-auto border border-mos-hair"
                    />
                  </div>
                )}
                {imgState.error && (
                  <div className="border-t border-mos-hair p-4 text-meta text-mos-red-ink">
                    {imgState.error}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right — Audit */}
        <aside className="border border-mos-hair bg-white self-start sticky top-6">
          <div className="px-5 py-4 border-b border-mos-hair">
            <div className="mos-eyebrow mb-1">Audit Score</div>
            <div className="mos-display text-[2.6rem] leading-none text-mos-ink">
              {audit ? audit.score : "—"}
            </div>
            <div className="mt-1 text-meta uppercase tracking-[0.18em] text-mos-muted">
              {audit
                ? `Verdict · ${audit.verdict}`
                : scoreMut.isPending
                ? "Scoring…"
                : "Awaiting draft"}
            </div>
          </div>
          <div className="px-5 py-4 space-y-3">
            {(audit?.dimensions ?? []).map((d: any) => (
              <div key={d.key}>
                <div className="flex items-center justify-between text-[0.78rem]">
                  <span className="text-mos-body">{d.label}</span>
                  <span className="text-mos-ink font-medium">{d.score}</span>
                </div>
                <div className="h-1 bg-mos-hair mt-1">
                  <div
                    className="h-1"
                    style={{ width: `${d.score}%`, background: tone.bg }}
                  />
                </div>
              </div>
            ))}
          </div>
          {audit?.summary && (
            <div className="border-t border-mos-hair px-5 py-4">
              <div className="mos-eyebrow mb-2">Suggestion</div>
              <p className="text-[0.85rem] text-mos-body leading-snug">
                {audit.summary}
              </p>
            </div>
          )}
          <div className="border-t border-mos-hair px-5 py-4 space-y-2 text-[0.85rem] text-mos-body">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={alsoIG} onChange={(e) => setAlsoIG(e.target.checked)} />
              Also publish to IG
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={alsoLI} onChange={(e) => setAlsoLI(e.target.checked)} />
              Also publish to LinkedIn
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} />
              Schedule for later
            </label>
          </div>
          <div className="border-t border-mos-hair p-4 flex gap-2">
            <button
              className="flex-1 py-3 text-[0.78rem] uppercase tracking-[0.18em] border border-mos-hair text-mos-body"
              onClick={() => navigate(-1)}
            >
              Save Draft
            </button>
            <button
              disabled={!audit || audit.verdict === "block"}
              className="flex-1 py-3 text-[0.78rem] uppercase tracking-[0.18em] text-white disabled:opacity-40"
              style={{ background: tone.bg }}
            >
              Publish Now
            </button>
          </div>
        </aside>
      </div>
    </StudioLayout>
  );
}
