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
import { Button, Breadcrumbs, BreadcrumbItem, Chip } from "@heroui/react";

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
    return <div className="px-8 py-10 text-default-500">載入中…</div>;
  }
  if (!s) {
    return (
      <div className="px-8 py-10">
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
    <main className="px-8 py-10">
      <Breadcrumbs size="sm" className="mb-3">
        <BreadcrumbItem href="/">首頁</BreadcrumbItem>
        <BreadcrumbItem href="/templates">任務範本</BreadcrumbItem>
        <BreadcrumbItem>{s.name ?? s.slug}</BreadcrumbItem>
      </Breadcrumbs>

      <div className="grid grid-cols-12 gap-6">
        <section className="col-span-7 space-y-4">
          <Chip size="sm" variant="flat" color="default" className="uppercase tracking-wider mb-1">
            METHODOLOGY · {(s.source ?? "seeded").toUpperCase()}
          </Chip>
          <h1 className="text-3xl font-semibold tracking-tight">
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
                <li key={i} className="flex gap-3 border border-divider rounded-md p-4 bg-content1">
                  <span className="w-8 h-8 rounded-full bg-default-100 border border-divider text-default-600 text-tiny font-semibold flex items-center justify-center shrink-0">
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

          <Button
            color="primary"
            size="md"
            onPress={() => applyToNewMission(s)}
            isDisabled={busy}
            isLoading={busy}
            className="mt-6"
          >
            {busy ? "建立中…" : "套用到新任務"}
          </Button>
          {errMsg && (
            <div className="mt-3 text-small text-danger whitespace-pre-wrap max-w-[560px]">
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
