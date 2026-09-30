/**
 * CampaignPerformance — 成效層「活動」tray：活動企劃的目標 vs 真的發出去的貼文。
 *
 * 2026-09-30（CJ「如果用戶不是從這邊發文，或是他實際發文時間跟我們這邊有變動，那我們會
 * 怎麼呈現？…應該讓真實的成效，引導到成效層，建立一個活動 mission tray」）。
 * 規則在 server/performance/core/campaignPerf.ts：
 *   · 從 OnBrand 發的自動對上（晚發也對得上，標「晚 N 天」）；
 *   · 不是從 OnBrand 發的列在「待確認」，猜最像哪一篇，一鍵配對／企劃外／不是這檔；
 *   · 數字照實際發文日歸段；粉專沒有的數字（名單、訂單…）先手動填。
 *
 * 設計系統：中性色；success 只給「已對上」。
 */
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Chip, Input, Select, SelectItem, Spinner, Progress } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare, faPenNib, faRotate } from "@fortawesome/free-solid-svg-icons";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import { CHANNEL_META, channelLabel } from "../../content/lib/channelMeta";
import { phaseShort } from "../../strategy/lib/campaignStage";
import { metricLabel, money, type KpiMetric } from "../../strategy/lib/campaignKpi";

const md = (s: string) => s.slice(5).replace("-", "/");
const num = (n: number | undefined | null) => (n == null ? "—" : n.toLocaleString("en-US"));
/** 粉專同步有的指標（server 的 PAGE_METRICS）。 */
const PAGE_METRICS = new Set(["reach", "impressions", "clicks", "engagement"]);

export default function CampaignPerformance({ brandId }: { brandId: number | null }) {
  const { lang } = useLang();
  const en = lang === "en";
  const L = (zh: string, e: string) => (en ? e : zh);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const utils = (trpc as any).useUtils();

  const listQ = (trpc as any).performance.campaignList.useQuery(
    { brandId: brandId ?? 0 }, { enabled: !!brandId, refetchOnWindowFocus: false },
  );
  const list: any[] = listQ.data ?? [];
  const urlE = Number(searchParams.get("e") ?? 0) || null;
  const eventId = urlE && list.some((c) => c.id === urlE) ? urlE : list[0]?.id ?? null;

  const repQ = (trpc as any).performance.campaignReport.useQuery(
    { brandId: brandId ?? 0, eventId: eventId ?? 0 }, { enabled: !!brandId && !!eventId, refetchOnWindowFocus: false },
  );
  const refresh = () => utils?.performance?.campaignReport?.invalidate?.();
  const matchMut = (trpc as any).performance.campaignMatch.useMutation({ onSuccess: refresh });
  const manualMut = (trpc as any).performance.campaignManual.useMutation({ onSuccess: refresh });
  const syncMut = (trpc as any).performance.syncFacebook.useMutation({ onSuccess: refresh });

  if (!brandId) return null;
  if (listQ.isLoading) return <div className="flex items-center gap-3 py-8"><Spinner size="sm" /><span className="text-small text-default-500">{L("載入中…", "Loading…")}</span></div>;
  if (listQ.error) return <p className="text-small text-danger">{String(listQ.error?.message ?? "").slice(0, 200)}</p>;
  if (!list.length) {
    return (
      <div className="rounded-3xl border border-divider bg-content1 p-8 flex flex-col items-start gap-3">
        <p className="text-large font-bold">{L("還沒有活動企劃", "No campaign plans yet")}</p>
        <p className="text-small text-default-500">{L("在策略層的「活動」排好企劃並定稿，這裡就會對照實際發出去的貼文。", "Plan and lock a campaign in Strategy; its results show up here.")}</p>
        <Button size="sm" color="primary" radius="md" onPress={() => navigate(`/brands/edit?b=${brandId}&cat=events`)}>{L("去策略層", "Go to Strategy")}</Button>
      </div>
    );
  }

  const r: any = repQ.data;
  const openItems = (r?.items ?? []).filter((i: any) => !i.fact);
  const noFacts = r && !r.items.some((i: any) => i.fact) && !r.candidates.length && !r.extras.length;

  return (
    <div className="flex flex-col gap-5">
      {/* ── 選活動 ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select size="sm" variant="bordered" radius="md" aria-label={L("活動", "Campaign")} className="max-w-[360px]"
          selectedKeys={eventId ? [String(eventId)] : []}
          onSelectionChange={(keys) => {
            const v = Array.from(keys as Set<string>)[0];
            if (!v) return;
            const sp = new URLSearchParams(searchParams); sp.set("e", v); setSearchParams(sp, { replace: true });
          }}>
          {list.map((c) => (
            <SelectItem key={String(c.id)} textValue={c.name}>
              {c.name}{c.locked ? "" : L("（草稿）", " (draft)")}
            </SelectItem>
          ))}
        </Select>
        {r && <span className="text-tiny text-default-500">{r.event.startAt ? `${r.event.startAt} → ${r.event.endAt ?? "?"}` : ""}　{L(`觀察期間 ${r.window.from} ~ ${r.window.to}`, `Window ${r.window.from} – ${r.window.to}`)}</span>}
        <Button size="sm" variant="light" radius="md" className="ml-auto"
          onPress={() => navigate(`/brands/edit?b=${brandId}&e=${eventId}&cat=campaign`)}>{L("看企劃 →", "Open plan →")}</Button>
      </div>

      {repQ.isLoading && <div className="flex items-center gap-3 py-6"><Spinner size="sm" /><span className="text-small text-default-500">{L("載入中…", "Loading…")}</span></div>}
      {repQ.error && <p className="text-small text-danger">{String(repQ.error?.message ?? "").slice(0, 200)}</p>}

      {r && (
        <>
          {/* ── 篇數對照 ── */}
          <div className="flex items-center gap-2 flex-wrap">
            {([
              [L("計畫", "Planned"), r.counts.planned, "default"],
              [L("對上", "On plan"), r.counts.matched, "success"],
              [L("時間有變動", "Moved"), r.counts.moved, "default"],
              [L("還沒發", "Not posted"), r.counts.missing, "default"],
              [L("還沒到", "Upcoming"), r.counts.upcoming, "default"],
              [L("企劃外", "Extra"), r.counts.extras, "default"],
              [L("待確認", "To confirm"), r.counts.pending, "default"],
            ] as const).map(([k, v, c]) => (
              <Chip key={k} size="sm" variant="flat" color={c as any} className="tabular-nums">{k} {v}</Chip>
            ))}
          </div>

          {noFacts && (
            <div className="rounded-2xl border border-dashed border-divider p-5 flex items-center gap-3 flex-wrap">
              <p className="text-small text-default-600 flex-1 min-w-[260px]">
                {!r.fbSyncEnabled
                  ? L("這個環境沒有開粉專串接，看不到真實貼文數字（正式站才有）。", "Page sync is off in this environment.")
                  : !r.fbPage
                    ? L("還沒連上粉專。連上並同步後，活動期間的貼文會自動對照到企劃。", "Connect your Facebook page to match posts to the plan.")
                    : L("活動期間還沒有同步到任何粉專貼文。", "No page posts synced for this window yet.")}
              </p>
              {r.fbSyncEnabled && r.fbPage && (
                <Button size="sm" variant="bordered" radius="md" isLoading={syncMut.isPending}
                  startContent={<FontAwesomeIcon icon={faRotate} />} onPress={() => syncMut.mutate({ brandId })}>{L("同步粉專", "Sync page")}</Button>
              )}
            </div>
          )}

          {/* ── 各段：目標 vs 實際 ── */}
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
            {r.phases.map((p: any) => {
              const pageLine = ["reach", "engagement", "clicks"].filter((m) => p.actual[m] != null);
              return (
                <div key={p.id} className="rounded-2xl border border-divider bg-content1 p-4 flex flex-col gap-3 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-medium font-bold">{phaseShort(p.id, en)}</p>
                    <p className="text-[11px] text-default-500 tabular-nums">{md(p.from)} – {md(p.to)}</p>
                  </div>
                  {p.budget != null && <p className="text-tiny text-default-500">{L("預算 ", "Budget ")}{money(p.budget, en)}</p>}
                  {p.targets.map((t: any) => {
                    const fromPage = PAGE_METRICS.has(t.metric);
                    const actual = fromPage ? p.actual[t.metric] : p.manual[t.metric];
                    const pct = t.target && actual != null ? Math.min(100, Math.round((actual / t.target) * 100)) : null;
                    return (
                      <div key={t.metric} className="flex flex-col gap-1">
                        <div className="flex items-baseline justify-between gap-2 text-small">
                          <span>{metricLabel(t.metric as KpiMetric, en)}</span>
                          <span className="tabular-nums text-default-600">
                            <b className="text-foreground">{num(actual)}</b>{t.target != null ? ` / ${num(t.target)}` : ""}
                          </span>
                        </div>
                        {pct != null && <Progress size="sm" aria-label={metricLabel(t.metric as KpiMetric, en)} value={pct} color={pct >= 100 ? "success" : "default"} />}
                        {!fromPage && (
                          <ManualInput value={p.manual[t.metric]} en={en}
                            onSave={(v) => manualMut.mutate({ brandId, eventId, phase: p.id, metric: t.metric, value: v })} />
                        )}
                      </div>
                    );
                  })}
                  {!p.targets.length && <p className="text-tiny text-default-400">{L("這一段還沒有設定 KPI。", "No KPIs for this phase.")}</p>}
                  {pageLine.length > 0 && (
                    <p className="text-[11px] text-default-500 tabular-nums">
                      {L("粉專：", "Page: ")}{pageLine.map((m) => `${metricLabel(m as KpiMetric, en)} ${num(p.actual[m])}`).join("・")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── 待確認 ── */}
          {r.candidates.length > 0 && (
            <section className="rounded-2xl border border-divider bg-content1 p-4 flex flex-col gap-3">
              <div>
                <p className="text-medium font-bold">{L(`待確認（${r.candidates.length}）`, `To confirm (${r.candidates.length})`)}</p>
                <p className="text-tiny text-default-500">{L("活動期間發在粉專、但不是從這裡發的貼文。是企劃裡的哪一篇？", "Page posts in the window that weren't published from here. Which plan post is it?")}</p>
              </div>
              {r.candidates.map((c: any) => (
                <Candidate key={c.key} c={c} openItems={openItems} en={en} busy={matchMut.isPending}
                  onAct={(action, itemId) => matchMut.mutate({ brandId, eventId, key: c.key, action, itemId: itemId ?? null })} />
              ))}
            </section>
          )}

          {/* ── 每一篇 ── */}
          <section className="rounded-2xl border border-divider bg-content1 overflow-x-auto">
            <table className="w-full min-w-[720px] text-small">
              <thead>
                <tr className="text-tiny text-default-500 text-left">
                  <th className="font-medium px-3 py-2">{L("企劃日", "Plan")}</th>
                  <th className="font-medium px-3 py-2">{L("實際", "Posted")}</th>
                  <th className="font-medium px-3 py-2">{L("階段", "Phase")}</th>
                  <th className="font-medium px-3 py-2">{L("這一篇", "Post")}</th>
                  <th className="font-medium px-3 py-2">{L("狀態", "Status")}</th>
                  <th className="font-medium px-3 py-2 text-right">{L("觸及", "Reach")}</th>
                  <th className="font-medium px-3 py-2 text-right">{L("互動", "Eng.")}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {r.items.map((i: any) => (
                  <tr key={i.id} className="border-t border-divider align-top">
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">{md(i.date)}</td>
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">{i.fact ? md(i.fact.date) : "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{phaseShort(i.phase, en)}</td>
                    <td className="px-3 py-2 min-w-0">
                      <span className="flex items-start gap-2">
                        <FontAwesomeIcon icon={CHANNEL_META[i.platform]?.icon ?? faPenNib} className="text-tiny text-default-500 mt-1" title={channelLabel(i.platform, en)} />
                        <span className="line-clamp-2">{i.angle}</span>
                        {i.paid && <Chip size="sm" className="h-5 text-[10.5px] bg-foreground text-background shrink-0">{L("廣告", "Ad")}</Chip>}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap"><StatusChip i={i} en={en} /></td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(i.fact?.metrics?.reach)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(i.fact?.metrics?.engagement)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      {i.fact?.permalink && (
                        <a href={i.fact.permalink} target="_blank" rel="noreferrer" className="text-default-500 hover:text-foreground" aria-label={L("看貼文", "View post")}>
                          <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-tiny" />
                        </a>
                      )}
                      {i.via === "confirmed" && (
                        <button type="button" className="ml-2 text-tiny text-default-400 hover:text-foreground"
                          onClick={() => matchMut.mutate({ brandId, eventId, key: i.fact.key, action: "clear" })}>{L("取消配對", "Unmatch")}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* ── 企劃外 ── */}
          {r.extras.length > 0 && (
            <section className="rounded-2xl border border-divider bg-content1 p-4 flex flex-col gap-2">
              <p className="text-medium font-bold">{L(`企劃外（${r.extras.length}）`, `Outside the plan (${r.extras.length})`)}</p>
              {r.extras.map((f: any) => (
                <div key={f.key} className="flex items-center gap-3 text-small">
                  <span className="tabular-nums text-default-500">{md(f.date)}</span>
                  <span className="flex-1 min-w-0 truncate">{f.text || L("（沒有內文）", "(no text)")}</span>
                  <span className="tabular-nums text-default-500">{L("觸及 ", "Reach ")}{num(f.metrics?.reach)}</span>
                  <button type="button" className="text-tiny text-default-400 hover:text-foreground"
                    onClick={() => matchMut.mutate({ brandId, eventId, key: f.key, action: "clear" })}>{L("放回待確認", "Undo")}</button>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function StatusChip({ i, en }: { i: any; en: boolean }) {
  const L = (zh: string, e: string) => (en ? e : zh);
  if (i.status === "matched") return <Chip size="sm" variant="flat" color="success">{L("對上", "On plan")}</Chip>;
  if (i.status === "moved") {
    const d = Math.abs(i.diffDays ?? 0);
    return <Chip size="sm" variant="flat">{i.diffDays > 0 ? L(`晚 ${d} 天`, `${d}d late`) : L(`早 ${d} 天`, `${d}d early`)}</Chip>;
  }
  if (i.status === "missing") return <Chip size="sm" variant="bordered">{L("還沒發", "Not posted")}</Chip>;
  return <span className="text-tiny text-default-400">{L("還沒到", "Upcoming")}</span>;
}

function ManualInput({ value, en, onSave }: { value: number | undefined; en: boolean; onSave: (v: number | null) => void }) {
  const [v, setV] = React.useState(value != null ? String(value) : "");
  React.useEffect(() => { setV(value != null ? String(value) : ""); }, [value]);
  const commit = () => {
    const n = v.trim() === "" ? null : Math.round(Number(v));
    if (n !== null && !Number.isFinite(n)) return;
    if ((n ?? undefined) !== value) onSave(n);
  };
  return (
    <Input size="sm" type="number" min={0} variant="bordered" radius="md" value={v} onValueChange={setV}
      onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
      aria-label={en ? "Enter actual" : "填實際數字"} placeholder={en ? "Not in page data — enter it" : "粉專沒有這個數字，手動填"}
      classNames={{ input: "text-tiny" }} />
  );
}

function Candidate({ c, openItems, en, busy, onAct }: {
  c: any; openItems: any[]; en: boolean; busy: boolean;
  onAct: (action: "match" | "extra" | "dismiss", itemId?: string) => void;
}) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const [pick, setPick] = React.useState<string>(c.suggestItemId ?? "");
  const suggested = openItems.find((i) => i.id === c.suggestItemId);
  return (
    <div className="border-t border-divider pt-3 flex flex-col gap-2">
      <div className="flex items-start gap-3 text-small">
        <span className="tabular-nums text-default-500 shrink-0">{md(c.date)}</span>
        <span className="flex-1 min-w-0 line-clamp-2">{c.text || L("（沒有內文）", "(no text)")}</span>
        <span className="tabular-nums text-default-500 shrink-0">{L("觸及 ", "Reach ")}{num(c.metrics?.reach)}</span>
        {c.permalink && (
          <a href={c.permalink} target="_blank" rel="noreferrer" className="text-default-500 hover:text-foreground shrink-0" aria-label={L("看貼文", "View post")}>
            <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-tiny" />
          </a>
        )}
      </div>
      {suggested && (
        <p className="text-tiny text-default-500">{L(`看起來像企劃上 ${md(suggested.date)} 那篇：`, `Looks like the ${md(suggested.date)} post: `)}{suggested.angle}</p>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <Select size="sm" variant="bordered" radius="md" aria-label={L("配對到哪一篇", "Match to")} className="max-w-[340px]"
          placeholder={L("配對到企劃上的哪一篇", "Match to a plan post")}
          selectedKeys={pick ? [pick] : []}
          onSelectionChange={(keys) => setPick(String(Array.from(keys as Set<string>)[0] ?? ""))}>
          {openItems.map((i) => (
            <SelectItem key={i.id} textValue={`${md(i.date)} ${i.angle}`}>{`${md(i.date)}　${i.angle}`}</SelectItem>
          ))}
        </Select>
        <Button size="sm" color="primary" radius="md" isDisabled={!pick || busy} onPress={() => onAct("match", pick)}>{L("配對", "Match")}</Button>
        <Button size="sm" variant="bordered" radius="md" isDisabled={busy} onPress={() => onAct("extra")}>{L("企劃外", "Outside plan")}</Button>
        <Button size="sm" variant="light" radius="md" isDisabled={busy} onPress={() => onAct("dismiss")}>{L("不是這檔", "Not this campaign")}</Button>
      </div>
    </div>
  );
}
