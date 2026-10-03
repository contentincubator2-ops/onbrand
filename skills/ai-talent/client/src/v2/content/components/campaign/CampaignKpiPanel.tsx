/**
 * CampaignKpiPanel — 「KPI 與預算」視窗：用戶填總數，投放專家拆到每一段、挑要下廣告的篇。
 *
 * 2026-09-30（CJ「少了廣告素材還有 KPI 設定，所以不知道每一階段，應該用多少資源，應該
 * 達到甚麼 KPI」→「用戶自己填，AI 從 AI AGENT 當中，選擇適合衡量指標的 agent，協助用戶
 * 填好 brief，AI 根據 KPI 的目標，抓不同階段的比例」）。
 *
 * 跟對話卡同一條紀律：專家回的是提案，按「套用」才寫進企劃；定稿後只能看。
 * 數字規則在 server/content/core/campaign/campaignKpi.ts（各段加起來一定等於用戶填的總數）。
 */
import React from "react";
import { Button, Input, Select, SelectItem, Textarea, Avatar } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faXmark, faBullhorn } from "@fortawesome/free-solid-svg-icons";
import { trpc } from "../../../../lib/trpc";
import { CAMPAIGN_PHASES, type CampaignPhaseId, type CampaignPlan } from "../../../strategy/lib/campaign/campaignSchema";
import { phaseShort } from "../../../strategy/lib/campaign/campaignStage";
import {
  KPI_METRICS, metricLabel, metricLine, money, type CampaignKpi, type KpiGoal, type KpiMetric, type PhaseKpi,
} from "../../../strategy/lib/campaign/campaignKpi";

type Proposal = CampaignKpi & { paidIds: string[] };

/** 每一段分到多少、看什麼、幾篇下廣告。畫面與提案共用。 */
export function KpiTable({ phases, plan, paidIds, en }: {
  phases: Partial<Record<CampaignPhaseId, PhaseKpi>>; plan: CampaignPlan; paidIds: Set<string>; en: boolean;
}) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const rows = CAMPAIGN_PHASES.filter((p) => phases[p.id]);
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto rounded-xl border border-divider">
      <table className="w-full min-w-[520px] text-small">
        <thead>
          <tr className="text-tiny text-default-500 text-left">
            <th className="font-medium px-3 py-2">{L("階段", "Phase")}</th>
            <th className="font-medium px-3 py-2 text-right">{L("占比", "Share")}</th>
            <th className="font-medium px-3 py-2 text-right">{L("預算", "Budget")}</th>
            <th className="font-medium px-3 py-2">KPI</th>
            <th className="font-medium px-3 py-2 text-right">{L("廣告", "Ads")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const k = phases[p.id]!;
            const ads = plan.items.filter((i) => i.phase === p.id && i.enabled && paidIds.has(i.id)).length;
            return (
              <tr key={p.id} className="border-t border-divider align-top">
                <td className="px-3 py-2 font-semibold whitespace-nowrap">{phaseShort(p.id, en)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{k.share}%</td>
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{money(k.budget, en)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-0.5">
                    {k.metrics.map((m) => <span key={m.metric}>{metricLine(m, en)}</span>)}
                    {k.note && <span className="text-tiny text-default-500">{k.note}</span>}
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{ads ? L(`${ads} 篇`, `${ads}`) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function CampaignKpiPanel({ eventId, plan, locked, en, onApply }: {
  eventId: number; plan: CampaignPlan; locked: boolean; en: boolean;
  onApply: (next: CampaignPlan) => void;
}) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const agentQ = (trpc as any).campaign.kpiAgent.useQuery({ eventId }, { refetchOnWindowFocus: false });
  const planMut = (trpc as any).campaign.planKpi.useMutation();
  const cur = plan.kpi ?? null;

  const [budget, setBudget] = React.useState<string>(cur?.budget ? String(cur.budget) : "");
  const [goals, setGoals] = React.useState<Array<{ metric: KpiMetric; target: string }>>(
    cur?.goals?.length ? cur.goals.map((g) => ({ metric: g.metric, target: String(g.target) })) : [{ metric: "leads", target: "" }],
  );
  const [notes, setNotes] = React.useState(cur?.notes ?? "");
  const [proposal, setProposal] = React.useState<Proposal | null>(null);
  const [err, setErr] = React.useState("");

  const agent = proposal?.agent ?? agentQ.data?.agent ?? cur?.agent ?? null;
  const cleanGoals: KpiGoal[] = goals
    .map((g) => ({ metric: g.metric, target: Math.round(Number(g.target)) }))
    .filter((g) => Number.isFinite(g.target) && g.target > 0);

  const run = () => {
    setErr("");
    const b = Math.round(Number(budget));
    planMut.mutate(
      { eventId, budget: Number.isFinite(b) && b > 0 ? b : null, goals: cleanGoals, notes: notes.trim() },
      { onSuccess: (r: Proposal) => setProposal(r), onError: (e: any) => setErr(String(e?.message ?? "").slice(0, 200)) },
    );
  };
  const apply = () => {
    if (!proposal) return;
    const { paidIds, ...kpi } = proposal;
    const paid = new Set(paidIds);
    onApply({ ...plan, kpi, items: plan.items.map((i) => ({ ...i, paid: paid.has(i.id) })) });
    setProposal(null);
  };

  const shown = proposal ?? cur;
  const shownPaid = new Set(proposal ? proposal.paidIds : plan.items.filter((i) => i.paid).map((i) => i.id));

  return (
    <div className="flex flex-col gap-5">
      {agent && (
        <div className="flex items-center gap-3">
          <Avatar src={agent.avatarUrl || undefined} name={agent.name} size="sm" />
          <div className="min-w-0">
            <p className="text-small font-semibold">{agent.name}</p>
            <p className="text-tiny text-default-500 truncate">{agent.title}　·　{L("協助你把總數拆到每一段", "Splits your totals across phases")}</p>
          </div>
        </div>
      )}

      {!locked && (
        <div className="flex flex-col gap-3">
          <Input type="number" min={0} size="sm" variant="bordered" radius="md" labelPlacement="outside"
            label={L("總預算（NT$，選填）", "Total budget (NT$, optional)")} placeholder={L("例：100000", "e.g. 100000")}
            value={budget} onValueChange={setBudget} className="max-w-[260px]" />
          <div className="flex flex-col gap-2">
            <p className="text-tiny text-default-600">{L("這檔活動要達成什麼（最多三個）", "What should this campaign achieve (up to 3)")}</p>
            {goals.map((g, k) => (
              <div key={k} className="flex items-center gap-2">
                <Select size="sm" variant="bordered" radius="md" aria-label={L("指標", "Metric")} className="max-w-[200px]"
                  selectedKeys={[g.metric]}
                  onSelectionChange={(keys) => {
                    const v = Array.from(keys as Set<string>)[0] as KpiMetric | undefined;
                    if (v) setGoals((prev) => prev.map((x, j) => (j === k ? { ...x, metric: v } : x)));
                  }}>
                  {KPI_METRICS.map((m) => <SelectItem key={m}>{metricLabel(m, en)}</SelectItem>)}
                </Select>
                <Input type="number" min={1} size="sm" variant="bordered" radius="md" aria-label={L("目標數字", "Target")}
                  placeholder={L("目標數字", "Target")} className="max-w-[160px]" value={g.target}
                  onValueChange={(v) => setGoals((prev) => prev.map((x, j) => (j === k ? { ...x, target: v } : x)))} />
                {goals.length > 1 && (
                  <Button isIconOnly size="sm" variant="light" aria-label={L("移除", "Remove")}
                    onPress={() => setGoals((prev) => prev.filter((_, j) => j !== k))}>
                    <FontAwesomeIcon icon={faXmark} />
                  </Button>
                )}
              </div>
            ))}
            {goals.length < 3 && (
              <Button size="sm" variant="light" radius="md" className="self-start" startContent={<FontAwesomeIcon icon={faPlus} />}
                onPress={() => setGoals((prev) => [...prev, { metric: "reach", target: "" }])}>
                {L("再加一個目標", "Add a goal")}
              </Button>
            )}
          </div>
          <Textarea size="sm" variant="bordered" radius="md" minRows={2} maxLength={800} labelPlacement="outside"
            label={L("其他條件（選填）", "Anything else (optional)")}
            placeholder={L("例：官網申請轉換率約 3%、每月最多花 5 萬、只想投 FB 和 IG", "e.g. known conversion rate, monthly cap, channels to use")}
            value={notes} onValueChange={setNotes} />
          <div className="flex items-center gap-3 flex-wrap">
            <Button size="sm" color="primary" radius="md" isLoading={planMut.isPending}
              isDisabled={!Number(budget) && !cleanGoals.length}
              onPress={run}>
              {planMut.isPending
                ? L("拆解中…約 20 秒", "Working… ~20s")
                : agent ? L(`請 ${agent.name} 拆到每一段`, `Ask ${agent.name} to split it`) : L("拆到每一段", "Split across phases")}
            </Button>
            {!Number(budget) && !cleanGoals.length && (
              <span className="text-tiny text-default-500">{L("至少填總預算或一個目標數字。", "Fill in a budget or at least one target.")}</span>
            )}
            {err && <span className="text-tiny text-danger">{err}</span>}
          </div>
        </div>
      )}

      {shown && Object.keys(shown.phases ?? {}).length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <p className="text-small font-semibold">{proposal ? L("提案（還沒寫進企劃）", "Proposal (not applied yet)") : L("目前的分配", "Current allocation")}</p>
            <p className="text-tiny text-default-500">
              {L("總預算 ", "Budget ")}{money(shown.budget, en)}
              {shown.goals?.length ? `　·　${shown.goals.map((g) => metricLine(g, en)).join("、")}` : ""}
            </p>
          </div>
          {shown.brief && <p className="text-small leading-relaxed">{shown.brief}</p>}
          <KpiTable phases={shown.phases} plan={plan} paidIds={shownPaid} en={en} />
          {shownPaid.size > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-tiny text-default-500 flex items-center gap-1.5"><FontAwesomeIcon icon={faBullhorn} />{L("要下廣告的貼文", "Posts to promote")}</p>
              {plan.items.filter((i) => shownPaid.has(i.id)).map((i) => (
                <p key={i.id} className="text-tiny">{i.date.slice(5).replace("-", "/")}　{i.angle}</p>
              ))}
            </div>
          )}
          {shown.assumptions?.length > 0 && (
            <div className="rounded-xl bg-default-100 px-3 py-2 flex flex-col gap-1">
              <p className="text-tiny font-semibold">{L("需要你確認的假設", "Assumptions to confirm")}</p>
              {shown.assumptions.map((a, k) => <p key={k} className="text-tiny text-default-600">・{a}</p>)}
            </div>
          )}
          {proposal && (
            <div className="flex items-center gap-2">
              <Button size="sm" color="primary" radius="md" onPress={apply}>{L("套用", "Apply")}</Button>
              <Button size="sm" variant="light" radius="md" onPress={() => setProposal(null)}>{L("不要", "Discard")}</Button>
            </div>
          )}
        </div>
      )}

      {locked && !shown && (
        <p className="text-small text-default-500">{L("企劃已定稿，還沒有設定 KPI。要設定請先解鎖。", "The plan is locked and has no KPIs. Unlock it to add some.")}</p>
      )}
    </div>
  );
}
