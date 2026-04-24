/**
 * TriagePage — 2-question diagnostic wizard (画面 1).
 *
 * Visual ref: roll-up banner. Large editorial headline, option tiles in a
 * 4-up grid with a single selection highlighting the geometric accent,
 * stage row underneath, final CTA anchored bottom.
 */

import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import StudioLayout from "../StudioLayout";
import { trpc } from "../../lib/trpc";

type Trigger =
  | "new-launch"
  | "pricing-stuck"
  | "audience-unclear"
  | "competitor-pressure"
  | "engagement-drop"
  | "post-campaign"
  | "other";

type Stage = "startup" | "growth" | "mature" | "crisis";

const TRIGGERS: Array<{ key: Trigger; label: string; zh: string }> = [
  { key: "new-launch",          label: "New Launch",         zh: "新品上市" },
  { key: "pricing-stuck",       label: "Pricing Stuck",      zh: "定價卡住" },
  { key: "audience-unclear",    label: "Audience Unclear",   zh: "受眾模糊" },
  { key: "competitor-pressure", label: "Competitor Pressure",zh: "競品逼近" },
  { key: "engagement-drop",     label: "Engagement Drop",    zh: "聲量下滑" },
  { key: "post-campaign",       label: "Post Campaign",      zh: "活動複盤" },
  { key: "other",               label: "Other",              zh: "其他" },
];

const STAGES: Array<{ key: Stage; label: string }> = [
  { key: "startup", label: "Startup" },
  { key: "growth", label: "Growth" },
  { key: "mature", label: "Mature" },
  { key: "crisis", label: "Crisis" },
];

export default function TriagePage() {
  const navigate = useNavigate();
  const { brandId } = useParams<{ brandId: string }>();
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [stage, setStage] = useState<Stage>("growth");
  const [notes, setNotes] = useState("");

  const start = trpc.triage.startSession.useMutation({
    onSuccess: (res) => {
      navigate(`/studio/${brandId}/templates`, {
        state: {
          sessionId: res.sessionId,
          recommendations: res.recommendations,
          trigger,
          stage,
        },
      });
    },
  });

  const submit = () => {
    if (!trigger || !brandId) return;
    start.mutate({
      brandId: Number(brandId),
      trigger,
      stageOrScale: stage,
      notes: notes || undefined,
    });
  };

  return (
    <StudioLayout>
      <div className="py-10 max-w-[1120px] mx-auto">
        <div className="mos-eyebrow mb-3">Decision AI</div>
        <h1 className="mos-display text-[3rem] leading-[1.05] text-mos-ink mb-3">
          What brings you here today.
        </h1>
        <p className="text-mos-muted text-[0.95rem] mb-12 max-w-[640px]">
          Pick the situation that best describes this week. We&rsquo;ll match it
          against SoWork&rsquo;s methodology library and recommend three
          approaches.
        </p>

        {/* Question 1 */}
        <div className="mos-eyebrow mb-4">01 · Situation</div>
        <div className="grid grid-cols-4 gap-px bg-mos-hair border border-mos-hair mb-12">
          {TRIGGERS.map((t) => {
            const selected = trigger === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTrigger(t.key)}
                className={[
                  "relative bg-white text-left p-6 h-[168px] flex flex-col justify-between transition",
                  selected
                    ? "ring-2 ring-mos-ink z-10"
                    : "hover:bg-mos-paper",
                ].join(" ")}
              >
                {selected && (
                  <div className="absolute top-0 left-0 right-0 h-1.5 bg-mos-ink" />
                )}
                <div className="mos-eyebrow">{String(TRIGGERS.indexOf(t) + 1).padStart(2, "0")}</div>
                <div>
                  <div className="mos-display text-[1.15rem] text-mos-ink leading-tight">
                    {t.label}
                  </div>
                  <div className="text-meta text-mos-muted mt-1">{t.zh}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Question 2 */}
        <div className="mos-eyebrow mb-4">02 · Brand Stage</div>
        <div className="flex gap-px bg-mos-hair border border-mos-hair mb-12">
          {STAGES.map((s) => (
            <button
              key={s.key}
              onClick={() => setStage(s.key)}
              className={[
                "flex-1 bg-white py-5 text-[0.9rem] tracking-wide transition",
                stage === s.key
                  ? "bg-mos-ink text-white"
                  : "text-mos-body hover:bg-mos-paper",
              ].join(" ")}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Notes */}
        <div className="mos-eyebrow mb-3">Notes (optional)</div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Anything specific about this situation..."
          className="w-full border border-mos-hair px-4 py-3 text-[0.92rem] text-mos-ink bg-white focus:outline-none focus:border-mos-ink mb-10"
        />

        <div className="flex items-center justify-between border-t border-mos-hair pt-8">
          <div className="text-meta text-mos-muted">
            {trigger ? `Selected: ${TRIGGERS.find((t) => t.key === trigger)?.label}` : "Select a situation to continue"}
          </div>
          <button
            disabled={!trigger || start.isPending}
            onClick={submit}
            className={[
              "px-8 py-4 text-[0.88rem] tracking-[0.18em] uppercase transition",
              trigger
                ? "bg-mos-ink text-white hover:bg-black"
                : "bg-mos-hair text-mos-soft cursor-not-allowed",
            ].join(" ")}
          >
            {start.isPending ? "Starting…" : "Start Diagnosis →"}
          </button>
        </div>
      </div>
    </StudioLayout>
  );
}
