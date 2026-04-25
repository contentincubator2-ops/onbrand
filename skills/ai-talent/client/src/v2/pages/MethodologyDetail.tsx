/**
 * MethodologyDetail — v2 D3 placeholder.
 * Fetch squad by slug, show the full hero + step list + apply CTA.
 */
import React from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import MethodologyCard from "../components/methodology/MethodologyCard";
import { accentForIndex } from "../../studio/primitives/tokens";

export default function MethodologyDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const createMission = trpc.mission.create.useMutation();
  const [busy, setBusy] = React.useState(false);

  const applyToNewMission = async (squad: any) => {
    if (busy) return;
    setBusy(true);
    try {
      const title = `新任務 · ${squad.name ?? squad.slug}`;
      const description = squad.description ?? "";
      const res = await createMission.mutateAsync({
        title,
        description,
        squadSlug: squad.slug,
        methodology: squad.methodology?.author ?? squad.name ?? "",
      });
      if (res?.id) navigate(`/m/${res.id}`);
    } catch (e: any) {
      alert(`建立任務失敗：${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const squadQuery = (trpc.squad as any).getSquadBySlug?.useQuery
    ? (trpc.squad as any).getSquadBySlug.useQuery(
        { slug: slug ?? "" },
        { enabled: !!slug, refetchOnWindowFocus: false }
      )
    : { data: null, isLoading: false };

  const s: any = squadQuery.data;

  if (squadQuery.isLoading) {
    return <div className="max-w-[1280px] mx-auto px-8 py-10 text-mos-muted">載入中…</div>;
  }
  if (!s) {
    return (
      <div className="max-w-[1280px] mx-auto px-8 py-10">
        <div className="text-mos-muted">找不到方法論「{slug}」。</div>
        <Link to="/methodology" className="mt-4 inline-block text-mos-ink underline underline-offset-4">
          ← 回方法論型錄
        </Link>
      </div>
    );
  }

  const stepObjs = Array.isArray(s.steps) ? s.steps : [];
  const accent = accentForIndex(Number(s.id ?? 0));

  return (
    <main className="max-w-[1280px] mx-auto px-8 py-10">
      <button
        onClick={() => navigate(-1)}
        className="text-[0.7rem] tracking-[0.18em] uppercase text-mos-muted hover:text-mos-ink mb-6"
      >
        ← 回型錄
      </button>

      <div className="grid grid-cols-12 gap-6">
        <section className="col-span-7 space-y-4">
          <div className="text-[0.66rem] tracking-[0.28em] uppercase text-mos-soft">
            METHODOLOGY · {(s.source ?? "seeded").toUpperCase()}
          </div>
          <h1 className="font-display text-[2.6rem] leading-[1.04] text-mos-ink tracking-[-0.02em]">
            {s.name ?? s.slug}
          </h1>
          {s.methodology?.author && (
            <div className="text-[0.86rem] text-mos-muted">
              {s.methodology.author}{s.methodology.year ? ` · ${s.methodology.year}` : ""}
            </div>
          )}
          {s.description && (
            <p className="text-[0.95rem] leading-relaxed text-mos-body whitespace-pre-wrap">
              {s.description}
            </p>
          )}

          <div className="border-t border-mos-hair pt-5">
            <div className="text-[0.66rem] tracking-[0.22em] uppercase text-mos-soft mb-3">
              工作流 · {stepObjs.length} steps
            </div>
            <ol className="space-y-3">
              {stepObjs.map((st: any, i: number) => (
                <li key={i} className="flex gap-3 border border-mos-hair bg-white p-4">
                  <span
                    className="w-8 h-8 rounded-full text-white text-[0.7rem] font-display flex items-center justify-center shrink-0"
                    style={{ background: accent === "teal" ? "#1A9B8E" : accent === "red" ? "#C8322E" : "#1E7FD4" }}
                  >
                    0{i + 1}
                  </span>
                  <div className="flex-1">
                    <div className="font-display text-[1rem] text-mos-ink">{st.name}</div>
                    {st.requiredSkill && (
                      <div className="text-[0.74rem] text-mos-muted">技能 · {st.requiredSkill}</div>
                    )}
                    {st.outputType && (
                      <div className="text-[0.74rem] text-mos-muted">產出 · {st.outputType}</div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <button
            onClick={() => applyToNewMission(s)}
            disabled={busy}
            className="mt-6 px-6 py-3 text-[0.74rem] tracking-[0.18em] uppercase bg-mos-ink text-white hover:bg-mos-body transition disabled:opacity-40 disabled:cursor-wait"
          >
            {busy ? "建立中…" : "套用到新任務 →"}
          </button>
        </section>

        <aside className="col-span-5 flex justify-end">
          <MethodologyCard
            accent={accent}
            variantIndex={Number(s.id ?? 0)}
            monogram={(s.tier || "L?").toUpperCase()}
            category={(s.strategyLayer || "LAYER") + " · " + (s.source ?? "seeded").toUpperCase()}
            title={s.name ?? s.slug}
            author={s.methodology?.author ?? s.slug}
            steps={stepObjs.slice(0, 4).map((st: any, idx: number) => ({
              name: st.name ?? `Step ${idx + 1}`,
              desc: st.requiredSkill ?? st.outputType ?? "",
              glyph: `0${idx + 1}`,
            }))}
            leadName={s.lead?.name ?? "Squad Lead"}
            leadAvatar={(s.lead?.name ?? "S")[0]}
            footerMeta={`${stepObjs.length} steps`}
            ctaLabel={busy ? "建立中…" : "套用"}
            onCtaClick={() => applyToNewMission(s)}
          />
        </aside>
      </div>
    </main>
  );
}
