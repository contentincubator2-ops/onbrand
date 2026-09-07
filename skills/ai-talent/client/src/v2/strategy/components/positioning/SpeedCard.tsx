/**
 * SpeedCard — 1-page summary view derived from positioning JSON.
 *
 * Three scope-specific layouts:
 *   brand   → 5 Whys 深層動機 + 競爭對手矩陣 + 目標受眾細分矩陣
 *   product → 產品核心價值 (tagline / value prop / USP) + 市場與競爭分析
 *   event   → 活動核心摘要 (定位陳述 / 標語 / 管道 / KOL / 內容 / KPI / 亮點)
 *
 * Pure read-only render. Edits happen on the per-segment editor pages.
 * Missing fields render as "—" so the layout doesn't break.
 */
import React from "react";
import { useLang } from "../../../../lib/i18n";
import { Card, CardBody, Chip, Divider } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faQuoteLeft, faShieldHalved, faUsers, faTrademark, faBox, faCalendarDay,
  faBullseye, faChartLine, faRocket, faMessage, faPodcast,
} from "@fortawesome/free-solid-svg-icons";

interface SpeedCardProps {
  scopeMode: "brand" | "product" | "event";
  scopeName: string;
  data: any;
}

const dash = <span className="text-default-400">—</span>;

/**
 * `audience.matrix` is either the current shape (named groups, each with an
 * addable needs list) or the legacy flat [{dim, primary, fan, weight}] shape
 * from before the 族群可新增 redesign — see SegmentEditor.tsx's
 * migrateNeedsGroups for the editable-side counterpart of this migration.
 */
function migrateNeedsGroupsForDisplay(value: any): any[] {
  if (!Array.isArray(value) || value.length === 0) return [];
  if (value.every((g) => g && typeof g === "object" && ("needs" in g || "name" in g))) {
    return value;
  }
  const isOldShape = value.some((r) => r && ("primary" in r || "fan" in r));
  if (!isOldShape) return [];
  return [
    { name: "主受眾", needs: value.map((r: any) => ({ dim: r.dim ?? "", score: r.primary ?? null, weight: r.weight ?? "" })) },
    { name: "次受眾", needs: value.map((r: any) => ({ dim: r.dim ?? "", score: r.fan ?? null, weight: r.weight ?? "" })) },
  ];
}

export default function SpeedCard({ scopeMode, scopeName, data }: SpeedCardProps) {
  const { lang } = useLang();
  if (scopeMode === "brand")   return <BrandSpeedCard   scopeName={scopeName} data={data} en={lang === "en"} />;
  if (scopeMode === "product") return <ProductSpeedCard scopeName={scopeName} data={data} en={lang === "en"} />;
  if (scopeMode === "event")   return <EventSpeedCard   scopeName={scopeName} data={data} en={lang === "en"} />;
  return null;
}

/* ─────────────────────────── Brand ─────────────────────────── */
function BrandSpeedCard({ scopeName, data, en }: { scopeName: string; data: any; en: boolean }) {
  const origin = data?.origin ?? {};
  const competition = data?.competition ?? {};
  const audience = data?.audience ?? {};
  const layers: any[] = Array.isArray(origin?.belief5Layers) ? origin.belief5Layers : [];
  const direct: any[] = Array.isArray(competition?.direct) ? competition.direct : [];
  const indirect: any[] = Array.isArray(competition?.indirect) ? competition.indirect : [];
  const needsGroups: any[] = migrateNeedsGroupsForDisplay(audience?.matrix);

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader icon={faTrademark} eyebrow={en ? "BRAND · QUICK CARD" : "BRAND · 速查卡"} title={scopeName} />

      {/* 5 Whys */}
      <Card shadow="none" className="border border-divider">
        <CardBody className="p-6 gap-4">
          <SubHeader icon={faQuoteLeft} title={en ? "5 Whys: deep motivation" : "5 Whys 深層動機分析"} sub={en ? "Dig layer by layer into the brand's founding motivation" : "逐層挖掘品牌創立的深層動機"} />
          {layers.length === 0 ? (
            <EmptyHint label={en ? "Not analyzed yet — run Wizard Step 1 in \"2.1 Brand origin story\"" : "尚未分析 — 在「2.1 品牌起源故事」段執行 Wizard Step 1"} />
          ) : (
            <div className="flex flex-col gap-3">
              {layers.map((row: any, i: number) => (
                <div key={i} className="flex gap-4 items-start">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-default-100 border border-divider text-default-600 text-tiny font-semibold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-small font-medium">{row.layer ?? "—"}</p>
                    <p className="text-small text-default-600 leading-relaxed">{row.body ?? "—"}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* 競爭對手矩陣 */}
      <Card shadow="none" className="border border-divider">
        <CardBody className="p-6 gap-4">
          <SubHeader icon={faShieldHalved} title={en ? "Competitor analysis matrix" : "競爭對手分析矩陣"} sub={en ? "Spot market gaps and differentiation" : "識別市場空白與差異化機會"} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Chip size="sm" variant="flat" className="mb-2">{en ? "Direct" : "直接競爭 Direct"}</Chip>
              {direct.length === 0 ? <EmptyHint label={en ? "Not analyzed yet" : "尚未分析"} inline /> : (
                <div className="flex flex-col gap-3">
                  {direct.map((c: any, i: number) => (
                    <div key={i} className="border border-divider rounded-md p-3">
                      <p className="text-small font-medium">{c.name ?? "—"}</p>
                      <p className="text-tiny text-default-500 mt-1">{c.position ?? "—"}</p>
                      {c.weakness && (
                        <p className="text-tiny text-default-500 mt-1">{en ? "Weakness: " : "弱點："}{c.weakness}</p>
                      )}
                      {c.ourEdge && (
                        <p className="text-tiny text-default-700 mt-1">{en ? "Our edge: " : "差異點："}{c.ourEdge}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Chip size="sm" variant="flat" className="mb-2">{en ? "Indirect" : "間接競爭 Indirect"}</Chip>
              {indirect.length === 0 ? <EmptyHint label={en ? "Not analyzed yet" : "尚未分析"} inline /> : (
                <div className="flex flex-col gap-3">
                  {indirect.map((c: any, i: number) => (
                    <div key={i} className="border border-divider rounded-md p-3">
                      <p className="text-small font-medium">{c.name ?? "—"}</p>
                      {c.threat   && <p className="text-tiny text-default-500 mt-1">{en ? "Threat: " : "威脅："}{c.threat}</p>}
                      {c.response && <p className="text-tiny text-default-700 mt-1">{en ? "Response: " : "應對："}{c.response}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* 目標受眾矩陣 */}
      <Card shadow="none" className="border border-divider">
        <CardBody className="p-6 gap-4">
          <SubHeader icon={faUsers} title={en ? "Audience segmentation matrix" : "目標受眾細分矩陣"} sub={en ? "Traits, needs, and behavior of each segment" : "不同族群的特徵、需求、行為模式"} />
          {audience?.primary || audience?.secondary ? (
            <>
              {audience?.primary && (
                <div className="border border-divider rounded-md p-4">
                  <Chip size="sm" variant="flat" color="primary" className="mb-2">{en ? "Primary" : "主受眾"}</Chip>
                  <p className="text-small text-default-700 leading-relaxed whitespace-pre-wrap">{audience.primary}</p>
                </div>
              )}
              {audience?.secondary && (
                <div className="border border-divider rounded-md p-4">
                  <Chip size="sm" variant="flat" className="mb-2">{en ? "Secondary" : "次受眾"}</Chip>
                  <p className="text-small text-default-700 leading-relaxed whitespace-pre-wrap">{audience.secondary}</p>
                </div>
              )}
              {needsGroups.length > 0 && (
                <>
                  <Divider />
                  <p className="text-small font-medium">{en ? "Needs by segment" : "各族群情感 / 功能需求"}</p>
                  {needsGroups.map((group: any, gi: number) => {
                    const needs: any[] = Array.isArray(group?.needs) ? group.needs : [];
                    if (needs.length === 0) return null;
                    return (
                      <div key={gi} className="flex flex-col gap-2">
                        <Chip size="sm" variant="flat" className="self-start">{group?.name || (en ? "Segment" : "族群")}</Chip>
                        <div className="overflow-x-auto">
                          <table className="w-full text-small">
                            <thead className="bg-default-50">
                              <tr>
                                <th className="text-left px-3 py-2 text-tiny font-medium text-default-600 border-b border-divider">{en ? "Need dimension" : "需求維度"}</th>
                                <th className="text-left px-3 py-2 text-tiny font-medium text-default-600 border-b border-divider">{en ? "Score" : "強度"}</th>
                                <th className="text-left px-3 py-2 text-tiny font-medium text-default-600 border-b border-divider">{en ? "Weight" : "重要性"}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {needs.map((row: any, i: number) => (
                                <tr key={i} className="border-t border-divider">
                                  <td className="px-3 py-2">{row.dim ?? "—"}</td>
                                  <td className="px-3 py-2">{row.score ?? "—"}</td>
                                  <td className="px-3 py-2 text-warning">{row.weight ?? "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </>
          ) : (
            <EmptyHint label={en ? "Not analyzed yet — run Wizard Step 6/7/8 in \"3. Target audience\"" : "尚未分析 — 在「3 目標受眾」段執行 Wizard Step 6/7/8"} />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/* ─────────────────────────── Product ─────────────────────────── */
function ProductSpeedCard({ scopeName, data, en }: { scopeName: string; data: any; en: boolean }) {
  const core = data?.core ?? {};
  const audience = data?.audience ?? {};
  const competition = data?.competition ?? {};
  const strategy = data?.strategy ?? {};
  const competitors: any[] = Array.isArray(competition?.competitors) ? competition.competitors : [];
  const mots: any[] = Array.isArray(audience?.mots) ? audience.mots : [];

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader icon={faBox} eyebrow={en ? "PRODUCT · QUICK CARD" : "PRODUCT · 速查卡"} title={scopeName} />

      {/* Core value */}
      <Card shadow="none" className="border border-divider">
        <CardBody className="p-6 gap-4">
          <SubHeader icon={faBullseye} title={en ? "Product Core Value" : "產品核心價值 / Product Core Value"}
            sub={en ? "Tagline, one-line value prop, differentiating USPs" : "標語、一句話價值主張、差異化賣點"} />
          <Pair label="PRODUCT TAGLINE">{core?.zhTagline ?? dash}<span className="text-default-500"> / </span>{core?.enTagline ?? dash}</Pair>
          <Pair label="VALUE PROPOSITION">{core?.oneLineValueProp ?? dash}</Pair>
          <Divider />
          <Pair label={en ? "Exclusive USP" : "獨家賣點"}>{competition?.uniqueUsp ?? dash}</Pair>
          <Pair label={en ? "Rare USP (few competitors claim)" : "少數競品也說的賣點"}>{competition?.rareUsp ?? dash}</Pair>
          <Pair label={en ? "Common USP (most competitors claim)" : "多數競爭者都說的賣點"}>{competition?.commonUsp ?? dash}</Pair>
        </CardBody>
      </Card>

      {/* Market & competition */}
      <Card shadow="none" className="border border-divider">
        <CardBody className="p-6 gap-4">
          <SubHeader icon={faShieldHalved} title="Market & Competition Analysis"
            sub={en ? "Competitors, audience MOTs, market gaps" : "競爭者、目標受眾 MOT、市場缺口"} />

          <div>
            <Chip size="sm" variant="flat" className="mb-2">{en ? "Competitors" : "競爭者"}</Chip>
            {competitors.length === 0 ? <EmptyHint label={en ? "Not analyzed yet" : "尚未分析"} inline /> : (
              <ul className="list-disc list-inside text-small text-default-700 space-y-1">
                {competitors.map((c: any, i: number) => (
                  <li key={i}>{c.name ?? "—"}{c.position ? ` — ${c.position}` : ""}</li>
                ))}
              </ul>
            )}
          </div>

          <Divider />

          <div>
            <Chip size="sm" variant="flat" className="mb-2">{en ? "Audience & MOT" : "目標受眾 & MOT"}</Chip>
            {mots.length === 0 ? <EmptyHint label={en ? "Not analyzed yet" : "尚未分析"} inline /> : (
              <div className="flex flex-col gap-2">
                {mots.map((m: any, i: number) => (
                  <div key={i} className="border border-divider rounded-md p-3">
                    <p className="text-small font-medium">{m.audience ?? "—"}</p>
                    <p className="text-tiny text-default-600 mt-1">{m.mot ?? "—"}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Divider />

          <div>
            <Chip size="sm" variant="flat" className="mb-2">{en ? "Product strategy gaps" : "產品策略缺口"}</Chip>
            <Pair label={en ? "Market audience" : "市場受眾"}>{strategy?.marketGap ?? dash}</Pair>
            <Pair label={en ? "Sales channel" : "銷售通路"}>{strategy?.channelGap ?? dash}</Pair>
            <Pair label={en ? "Price range" : "價格區間"}>{strategy?.priceGap ?? dash}</Pair>
            <Pair label={en ? "Promotion strategy" : "推廣策略"}>{strategy?.promotionGap ?? dash}</Pair>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

/* ─────────────────────────── Event ─────────────────────────── */
// Reads new 11-segment schema (CJ direction 2026-04-29). Falls back to
// old segIds (overview/solution) so events created before the schema
// rewrite still render something instead of going completely blank.
function EventSpeedCard({ scopeName, data, en }: { scopeName: string; data: any; en: boolean }) {
  // New schema segments
  const brief      = data?.brief      ?? {};
  const context    = data?.context    ?? {};
  const audience   = data?.audience   ?? {};
  const objectives = data?.objectives ?? {};
  const smp        = data?.smp        ?? {};
  const creative   = data?.creative   ?? {};
  const channelsSeg= data?.channels   ?? {};
  // Legacy fallback segments (pre-2026-04-29)
  const overview = data?.overview ?? {};
  const solution = data?.solution ?? {};

  const phases: any[] = Array.isArray(channelsSeg?.phases) ? channelsSeg.phases : [];
  const kpis: string[] = Array.isArray(objectives?.kpis)
    ? objectives.kpis
    : Array.isArray(solution?.kpis) ? solution.kpis : [];
  const supporting: string[] = Array.isArray(data?.messaging?.supportingPoints) ? data.messaging.supportingPoints : [];

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader icon={faCalendarDay} eyebrow={en ? "EVENT · QUICK CARD" : "EVENT · 速查卡"} title={scopeName} />

      <Card shadow="none" className="border border-divider">
        <CardBody className="p-6 gap-4">
          <SubHeader icon={faRocket} title={en ? "Strategic brief" : "戰略簡報"} sub={en ? "Auto-generated from intake (type / role / summary)" : "intake 自動產出（活動類型 / 角色 / 摘要）"} />
          <Pair label={en ? "Event type" : "活動類型"}>{brief?.eventType ?? dash}</Pair>
          <Pair label={en ? "Role this round" : "本次角色"}>{brief?.roleThisRound ?? dash}</Pair>
          <Pair label={en ? "Positioning summary" : "活動定位摘要"}>{brief?.briefSummary ?? overview?.positioningStatement ?? dash}</Pair>
        </CardBody>
      </Card>

      <Card shadow="none" className="border border-divider">
        <CardBody className="p-6 gap-4">
          <SubHeader icon={faMessage} title={en ? "Context & audience" : "背景與受眾"} sub={en ? "Business reality + core problem + audience insight" : "商業現況 + 核心問題 + 受眾洞察"} />
          <Pair label={en ? "Business background" : "商業背景"}>{context?.businessBackground ?? dash}</Pair>
          <Pair label={en ? "Core problem" : "核心問題"}>{context?.coreProblem ?? dash}</Pair>
          <Pair label={en ? "Key insight" : "關鍵洞察"}>{audience?.keyInsight ?? dash}</Pair>
        </CardBody>
      </Card>

      <Card shadow="none" className="border border-divider">
        <CardBody className="p-6 gap-4">
          <SubHeader icon={faRocket} title={en ? "SMP — Single Minded Proposition" : "SMP 單一核心命題"} sub={en ? "Top-level guidance for the whole event" : "整個活動最高指導原則"} />
          <Pair label="SMP">{smp?.singleMindedProposition ?? dash}</Pair>
          <Pair label={en ? "Why this line" : "為什麼是這句"}>{smp?.rationale ?? dash}</Pair>
        </CardBody>
      </Card>

      <Card shadow="none" className="border border-divider">
        <CardBody className="p-6 gap-4">
          <SubHeader icon={faMessage} title={en ? "Creative + messaging" : "創意 + 訊息"} sub={en ? "Creative theme + supporting messages" : "創意主題 + 支撐訊息"} />
          <Pair label={en ? "Creative theme" : "創意主題"}>{creative?.creativeTheme ?? solution?.conceptName ?? dash}</Pair>
          <Pair label={en ? "Core metaphor" : "核心比喻"}>{creative?.coreMetaphor ?? solution?.coreConcept ?? dash}</Pair>
          <Pair label={en ? "One-line hook" : "一句話 hook"}>{creative?.coreTranslation ?? dash}</Pair>
          <div>
            <Chip size="sm" variant="flat" className="mb-2">{en ? "Supporting messages" : "支撐訊息"}</Chip>
            {supporting.length === 0 ? <EmptyHint label={en ? "Not set yet" : "尚未設定"} inline /> : (
              <ul className="list-disc list-inside text-small text-default-700 space-y-1">
                {supporting.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            )}
          </div>
        </CardBody>
      </Card>

      <Card shadow="none" className="border border-divider">
        <CardBody className="p-6 gap-4">
          <SubHeader icon={faMessage} title={en ? "Channels / journey / KPI" : "管道 / 旅程 / KPI"} sub={en ? "Event execution blueprint" : "活動執行藍圖"} />

          <div>
            <Chip size="sm" variant="flat" className="mb-2">{en ? "Phase × channel × content" : "階段 × 管道 × 內容型態"}</Chip>
            {phases.length === 0 ? <EmptyHint label={en ? "Not set yet" : "尚未設定"} inline /> : (
              <ol className="list-decimal list-inside text-small text-default-700 space-y-1">
                {phases.map((p: any, i) => (
                  <li key={i}>
                    <strong>{p?.stage ?? "—"}</strong> · {p?.channels ?? "—"} · {p?.contentTypes ?? "—"}
                  </li>
                ))}
              </ol>
            )}
          </div>

          <Divider />

          <div>
            <Chip size="sm" variant="flat" className="mb-2">{en ? "KPIs" : "KPI 成效指標"}</Chip>
            {kpis.length === 0 ? <EmptyHint label={en ? "Not set yet" : "尚未設定"} inline /> : (
              <div className="flex gap-2 flex-wrap">
                {kpis.map((k, i) => <Chip key={i} size="sm" variant="flat" color="default" startContent={<FontAwesomeIcon icon={faChartLine} className="text-tiny ml-1" />}>{k}</Chip>)}
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

/* ─────────────────────────── Building blocks ─────────────────────────── */
function SectionHeader({ icon, eyebrow, title }: { icon: any; eyebrow: string; title: string }) {
  return (
    <Card shadow="none" className="border border-divider">
      <CardBody className="px-5 py-4 gap-1 flex-row items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-default-100 border border-divider flex items-center justify-center">
          <FontAwesomeIcon icon={icon} className="text-default-600" />
        </div>
        <div>
          <p className="text-tiny text-default-500 uppercase tracking-wider">{eyebrow}</p>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        </div>
      </CardBody>
    </Card>
  );
}
function SubHeader({ icon, title, sub }: { icon: any; title: string; sub?: string }) {
  return (
    <div>
      <p className="text-medium font-semibold flex items-center gap-2">
        <FontAwesomeIcon icon={icon} className="text-default-500" />
        {title}
      </p>
      {sub && <p className="text-tiny text-default-500 mt-0.5">{sub}</p>}
    </div>
  );
}
function Pair({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-tiny text-default-500 uppercase tracking-wider">{label}</p>
      <p className="text-small text-default-700 leading-relaxed">{children}</p>
    </div>
  );
}
function EmptyHint({ label, inline = false }: { label: string; inline?: boolean }) {
  return (
    <p className={`text-tiny text-default-400 ${inline ? "" : "py-3 text-center"}`}>{label}</p>
  );
}
