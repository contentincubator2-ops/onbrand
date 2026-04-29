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

export default function SpeedCard({ scopeMode, scopeName, data }: SpeedCardProps) {
  if (scopeMode === "brand")   return <BrandSpeedCard   scopeName={scopeName} data={data} />;
  if (scopeMode === "product") return <ProductSpeedCard scopeName={scopeName} data={data} />;
  if (scopeMode === "event")   return <EventSpeedCard   scopeName={scopeName} data={data} />;
  return null;
}

/* ─────────────────────────── Brand ─────────────────────────── */
function BrandSpeedCard({ scopeName, data }: { scopeName: string; data: any }) {
  const origin = data?.origin ?? {};
  const competition = data?.competition ?? {};
  const audience = data?.audience ?? {};
  const layers: any[] = Array.isArray(origin?.belief5Layers) ? origin.belief5Layers : [];
  const direct: any[] = Array.isArray(competition?.direct) ? competition.direct : [];
  const indirect: any[] = Array.isArray(competition?.indirect) ? competition.indirect : [];
  const audienceMatrix: any[] = Array.isArray(audience?.matrix) ? audience.matrix : [];

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader icon={faTrademark} eyebrow="BRAND · 速查卡" title={scopeName} />

      {/* 5 Whys */}
      <Card shadow="none" className="border border-divider">
        <CardBody className="p-6 gap-4">
          <SubHeader icon={faQuoteLeft} title="5 Whys 深層動機分析" sub="逐層挖掘品牌創立的深層動機" />
          {layers.length === 0 ? (
            <EmptyHint label="尚未分析 — 在「2.1 品牌起源故事」段執行 Wizard Step 1" />
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
          <SubHeader icon={faShieldHalved} title="競爭對手分析矩陣" sub="識別市場空白與差異化機會" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Chip size="sm" variant="flat" className="mb-2">直接競爭 Direct</Chip>
              {direct.length === 0 ? <EmptyHint label="尚未分析" inline /> : (
                <div className="flex flex-col gap-3">
                  {direct.map((c: any, i: number) => (
                    <div key={i} className="border border-divider rounded-md p-3">
                      <p className="text-small font-medium">{c.name ?? "—"}</p>
                      <p className="text-tiny text-default-500 mt-1">{c.position ?? "—"}</p>
                      {c.weakness && (
                        <p className="text-tiny text-default-500 mt-1">弱點：{c.weakness}</p>
                      )}
                      {c.ourEdge && (
                        <p className="text-tiny text-default-700 mt-1">差異點：{c.ourEdge}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Chip size="sm" variant="flat" className="mb-2">間接競爭 Indirect</Chip>
              {indirect.length === 0 ? <EmptyHint label="尚未分析" inline /> : (
                <div className="flex flex-col gap-3">
                  {indirect.map((c: any, i: number) => (
                    <div key={i} className="border border-divider rounded-md p-3">
                      <p className="text-small font-medium">{c.name ?? "—"}</p>
                      {c.threat   && <p className="text-tiny text-default-500 mt-1">威脅：{c.threat}</p>}
                      {c.response && <p className="text-tiny text-default-700 mt-1">應對：{c.response}</p>}
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
          <SubHeader icon={faUsers} title="目標受眾細分矩陣" sub="不同族群的特徵、需求、行為模式" />
          {audience?.primary || audience?.secondary ? (
            <>
              {audience?.primary && (
                <div className="border border-divider rounded-md p-4">
                  <Chip size="sm" variant="flat" color="primary" className="mb-2">主受眾</Chip>
                  <p className="text-small text-default-700 leading-relaxed whitespace-pre-wrap">{audience.primary}</p>
                </div>
              )}
              {audience?.secondary && (
                <div className="border border-divider rounded-md p-4">
                  <Chip size="sm" variant="flat" className="mb-2">次受眾</Chip>
                  <p className="text-small text-default-700 leading-relaxed whitespace-pre-wrap">{audience.secondary}</p>
                </div>
              )}
              {audienceMatrix.length > 0 && (
                <>
                  <Divider />
                  <p className="text-small font-medium">情感需求評分矩陣</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-small">
                      <thead className="bg-default-50">
                        <tr>
                          <th className="text-left px-3 py-2 text-tiny font-medium text-default-600 border-b border-divider">需求維度</th>
                          <th className="text-left px-3 py-2 text-tiny font-medium text-default-600 border-b border-divider">主受眾</th>
                          <th className="text-left px-3 py-2 text-tiny font-medium text-default-600 border-b border-divider">粉絲</th>
                          <th className="text-left px-3 py-2 text-tiny font-medium text-default-600 border-b border-divider">重要性</th>
                        </tr>
                      </thead>
                      <tbody>
                        {audienceMatrix.map((row: any, i: number) => (
                          <tr key={i} className="border-t border-divider">
                            <td className="px-3 py-2">{row.dim ?? "—"}</td>
                            <td className="px-3 py-2">{row.primary ?? "—"}</td>
                            <td className="px-3 py-2">{row.fan ?? "—"}</td>
                            <td className="px-3 py-2 text-warning">{row.weight ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          ) : (
            <EmptyHint label="尚未分析 — 在「3 目標受眾」段執行 Wizard Step 6/7/8" />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/* ─────────────────────────── Product ─────────────────────────── */
function ProductSpeedCard({ scopeName, data }: { scopeName: string; data: any }) {
  const core = data?.core ?? {};
  const audience = data?.audience ?? {};
  const competition = data?.competition ?? {};
  const strategy = data?.strategy ?? {};
  const competitors: any[] = Array.isArray(competition?.competitors) ? competition.competitors : [];
  const mots: any[] = Array.isArray(audience?.mots) ? audience.mots : [];

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader icon={faBox} eyebrow="PRODUCT · 速查卡" title={scopeName} />

      {/* Core value */}
      <Card shadow="none" className="border border-divider">
        <CardBody className="p-6 gap-4">
          <SubHeader icon={faBullseye} title="產品核心價值 / Product Core Value"
            sub="標語、一句話價值主張、差異化賣點" />
          <Pair label="PRODUCT TAGLINE">{core?.zhTagline ?? dash}<span className="text-default-500"> / </span>{core?.enTagline ?? dash}</Pair>
          <Pair label="VALUE PROPOSITION">{core?.oneLineValueProp ?? dash}</Pair>
          <Divider />
          <Pair label="獨家賣點">{competition?.uniqueUsp ?? dash}</Pair>
          <Pair label="少數競品也說的賣點">{competition?.rareUsp ?? dash}</Pair>
          <Pair label="多數競爭者都說的賣點">{competition?.commonUsp ?? dash}</Pair>
        </CardBody>
      </Card>

      {/* Market & competition */}
      <Card shadow="none" className="border border-divider">
        <CardBody className="p-6 gap-4">
          <SubHeader icon={faShieldHalved} title="Market & Competition Analysis"
            sub="競爭者、目標受眾 MOT、市場缺口" />

          <div>
            <Chip size="sm" variant="flat" className="mb-2">競爭者</Chip>
            {competitors.length === 0 ? <EmptyHint label="尚未分析" inline /> : (
              <ul className="list-disc list-inside text-small text-default-700 space-y-1">
                {competitors.map((c: any, i: number) => (
                  <li key={i}>{c.name ?? "—"}{c.position ? ` — ${c.position}` : ""}</li>
                ))}
              </ul>
            )}
          </div>

          <Divider />

          <div>
            <Chip size="sm" variant="flat" className="mb-2">目標受眾 & MOT</Chip>
            {mots.length === 0 ? <EmptyHint label="尚未分析" inline /> : (
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
            <Chip size="sm" variant="flat" className="mb-2">產品策略缺口</Chip>
            <Pair label="市場受眾">{strategy?.marketGap ?? dash}</Pair>
            <Pair label="銷售通路">{strategy?.channelGap ?? dash}</Pair>
            <Pair label="價格區間">{strategy?.priceGap ?? dash}</Pair>
            <Pair label="推廣策略">{strategy?.promotionGap ?? dash}</Pair>
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
function EventSpeedCard({ scopeName, data }: { scopeName: string; data: any }) {
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
      <SectionHeader icon={faCalendarDay} eyebrow="EVENT · 速查卡" title={scopeName} />

      <Card shadow="none" className="border border-divider">
        <CardBody className="p-6 gap-4">
          <SubHeader icon={faRocket} title="戰略 Brief" sub="intake 自動產出（活動類型 / 角色 / 摘要）" />
          <Pair label="活動類型">{brief?.eventType ?? dash}</Pair>
          <Pair label="本次角色">{brief?.roleThisRound ?? dash}</Pair>
          <Pair label="活動定位摘要">{brief?.briefSummary ?? overview?.positioningStatement ?? dash}</Pair>
        </CardBody>
      </Card>

      <Card shadow="none" className="border border-divider">
        <CardBody className="p-6 gap-4">
          <SubHeader icon={faMessage} title="背景與受眾" sub="商業現況 + 核心問題 + 受眾洞察" />
          <Pair label="商業背景">{context?.businessBackground ?? dash}</Pair>
          <Pair label="核心問題">{context?.coreProblem ?? dash}</Pair>
          <Pair label="關鍵洞察">{audience?.keyInsight ?? dash}</Pair>
        </CardBody>
      </Card>

      <Card shadow="none" className="border border-divider">
        <CardBody className="p-6 gap-4">
          <SubHeader icon={faRocket} title="SMP 單一核心命題" sub="整個活動最高指導原則" />
          <Pair label="SMP">{smp?.singleMindedProposition ?? dash}</Pair>
          <Pair label="為什麼是這句">{smp?.rationale ?? dash}</Pair>
        </CardBody>
      </Card>

      <Card shadow="none" className="border border-divider">
        <CardBody className="p-6 gap-4">
          <SubHeader icon={faMessage} title="創意 + 訊息" sub="創意主題 + 支撐訊息" />
          <Pair label="創意主題">{creative?.creativeTheme ?? solution?.conceptName ?? dash}</Pair>
          <Pair label="核心比喻">{creative?.coreMetaphor ?? solution?.coreConcept ?? dash}</Pair>
          <Pair label="一句話 hook">{creative?.coreTranslation ?? dash}</Pair>
          <div>
            <Chip size="sm" variant="flat" className="mb-2">支撐訊息</Chip>
            {supporting.length === 0 ? <EmptyHint label="尚未設定" inline /> : (
              <ul className="list-disc list-inside text-small text-default-700 space-y-1">
                {supporting.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            )}
          </div>
        </CardBody>
      </Card>

      <Card shadow="none" className="border border-divider">
        <CardBody className="p-6 gap-4">
          <SubHeader icon={faMessage} title="管道 / 旅程 / KPI" sub="活動執行藍圖" />

          <div>
            <Chip size="sm" variant="flat" className="mb-2">階段 × 管道 × 內容型態</Chip>
            {phases.length === 0 ? <EmptyHint label="尚未設定" inline /> : (
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
            <Chip size="sm" variant="flat" className="mb-2">KPI 成效指標</Chip>
            {kpis.length === 0 ? <EmptyHint label="尚未設定" inline /> : (
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
