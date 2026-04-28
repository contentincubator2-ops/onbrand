/**
 * MethodologyDetail — v2 D3 placeholder.
 * Fetch squad by slug, show the full hero + step list + apply CTA.
 */
import React from "react";
import { useParams, useNavigate, Link, useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import MethodologyCard from "../components/methodology/MethodologyCard";
import { accentForIndex } from "../../studio/primitives/tokens";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";

export default function MethodologyDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const ctx = useOutletContext<ShellOutletCtx | undefined>();
  const brandId = ctx?.brandId ?? null;

  const createMission = trpc.mission.create.useMutation();
  const [busy, setBusy] = React.useState(false);
  const [errMsg, setErrMsg] = React.useState<string | null>(null);

  const applyToNewMission = async (squad: any) => {
    if (busy) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const title = `新任務 · ${squad.name ?? squad.slug}`;
      const desc = (squad.description ?? "").slice(0, 1000);
      const res = await createMission.mutateAsync({
        title,
        description: desc || undefined,
        squadSlug: squad.slug,
        methodology: squad.methodology?.author ?? squad.name ?? undefined,
        brandId: brandId ?? undefined,
      });
      if (!res?.id) {
        setErrMsg("後端沒有回傳 mission id，請重試");
        return;
      }
      navigate(brandId ? `/b/${brandId}/_/m/${res.id}` : `/m/${res.id}`);
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error("[MethodologyDetail] mission.create failed:", e);
      setErrMsg(`建立任務失敗：${e?.message ?? String(e)}`);
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
    return <div className="max-w-[1280px] mx-auto px-8 py-10 text-default-500">載入中…</div>;
  }
  if (!s) {
    return (
      <div className="max-w-[1280px] mx-auto px-8 py-10">
        <div className="text-default-500">找不到任務範本「{slug}」。</div>
        <Link to="/templates" className="mt-4 inline-block text-foreground underline underline-offset-4">
          ← 回任務範本型錄
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
        className="text-tiny tracking-[0.18em] uppercase text-default-500 hover:text-foreground mb-6"
      >
        ← 回型錄
      </button>

      <div className="grid grid-cols-12 gap-6">
        <section className="col-span-7 space-y-4">
          <div className="text-tiny tracking-[0.28em] uppercase text-default-400">
            METHODOLOGY · {(s.source ?? "seeded").toUpperCase()}
          </div>
          <h1 className="font-semibold text-3xl leading-[1.04] text-foreground tracking-[-0.02em]">
            {s.name ?? s.slug}
          </h1>
          {s.methodology?.author && (
            <div className="text-small text-default-500">
              {s.methodology.author}{s.methodology.year ? ` · ${s.methodology.year}` : ""}
            </div>
          )}
          {s.description && (
            <p className="text-small leading-relaxed text-foreground whitespace-pre-wrap">
              {s.description}
            </p>
          )}

          <div className="border-t border-divider pt-5">
            <div className="text-tiny tracking-[0.22em] uppercase text-default-400 mb-3">
              工作流 · {stepObjs.length} steps
            </div>
            <ol className="space-y-3">
              {stepObjs.map((st: any, i: number) => (
                <li key={i} className="flex gap-3 border border-divider bg-white p-4">
                  <span
                    className="w-8 h-8 rounded-full text-white text-tiny font-semibold flex items-center justify-center shrink-0"
                    style={{ background: accent === "teal" ? "#1A9B8E" : accent === "red" ? "#C8322E" : "#1E7FD4" }}
                  >
                    0{i + 1}
                  </span>
                  <div className="flex-1">
                    <div className="font-semibold text-medium text-foreground">{st.name}</div>
                    {st.requiredSkill && (
                      <div className="text-tiny text-default-500">技能 · {st.requiredSkill}</div>
                    )}
                    {st.outputType && (
                      <div className="text-tiny text-default-500">產出 · {st.outputType}</div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <button
            onClick={() => applyToNewMission(s)}
            disabled={busy}
            className="mt-6 px-6 py-3 text-tiny tracking-[0.18em] uppercase bg-foreground text-white hover:bg-foreground/90 transition disabled:opacity-40 disabled:cursor-wait"
          >
            {busy ? "建立中…" : "套用到新任務 →"}
          </button>
          {errMsg && (
            <div className="mt-3 text-small text-red-600 whitespace-pre-wrap max-w-[560px]">
              {errMsg}
            </div>
          )}
        </section>

        <aside className="col-span-5 flex justify-end">
          <MethodologyCard
            layer={s.strategyLayer ?? s.tier ?? null}
            seed={s.slug ?? s.id ?? 0}
            title={s.name ?? s.slug}
            author={s.methodology?.author ? `${s.methodology.author}${s.methodology?.year ? " · " + s.methodology.year : ""}` : null}
            source={s.source ?? "seeded"}
            steps={stepObjs.slice(0, 4).map((st: any, idx: number) => ({
              name: st.name ?? `Step ${idx + 1}`,
              desc: st.requiredSkill ?? st.outputType ?? "",
              glyph: `0${idx + 1}`,
            }))}
            leadName={s.lead?.name ?? "Squad Lead"}
            ctaLabel={busy ? "建立中…" : "套用"}
            onCtaClick={() => applyToNewMission(s)}
          />
        </aside>
      </div>
    </main>
  );
}
