/**
 * SpeedCard — 1-page summary view derived from positioning JSON.
 *
 * Three scope-specific layouts:
 *   brand   → 5 Whys 深層動機 + 競爭對手矩陣 + 目標受眾細分矩陣
 *   product → 產品核心價值 (tagline / value prop / USP) + 市場與競爭分析
 *   event   → 活動核心摘要 (定位陳述 / 標語 / 渠道 / KOL / 內容 / KPI / 亮點)
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
function EventSpeedCard({ scopeName, data }: { scopeName: string; data: any }) {
  const overview = data?.overview ?? {};
  const solution = data?.solution ?? {};
  const channels: string[]      = Array.isArray(solution?.channels)      ? solution.channels      : [];
  const contentAngles: string[] = Array.isArray(solution?.contentAngles) ? solution.contentAngles : [];
  const kpis: string[]          = Array.isArray(solution?.kpis)          ? solution.kpis          : [];
  const highlights: string[]    = Array.isArray(solution?.highlights)    ? solution.highlights    : [];

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader icon={faCalendarDay} eyebrow="EVENT · 速查卡" title={scopeName} />

      <Card shadow="none" className="border border-divider">
        <CardBody className="p-6 gap-4">
          <SubHeader icon={faRocket} title="活動核心摘要" sub="活動定位陳述 + 標語 + 概念" />
          <Pair label="活動名稱">{overview?.name ?? dash}</Pair>
          <Pair label="選定策略方案">{solution?.conceptName ?? dash}</Pair>
          <Pair label="核心概念">{solution?.coreConcept ?? dash}</Pair>
          <Pair label="活動定位陳述">{overview?.positioningStatement ?? dash}</Pair>
          <Pair label="活動標語">{overview?.zhTagline ?? dash}<span className="text-default-500"> / </span>{overview?.enTagline ?? dash}</Pair>
        </CardBody>
      </Card>

      <Card shadow="none" className="border border-divider">
        <CardBody className="p-6 gap-4">
          <SubHeader icon={faMessage} title="渠道 / KOL / 內容 / KPI" sub="活動執行藍圖" />

          <div>
            <Chip size="sm" variant="flat" className="mb-2">渠道策略</Chip>
            {channels.length === 0 ? <EmptyHint label="尚未設定" inline /> : (
              <div className="flex gap-2 flex-wrap">
                {channels.map((c, i) => <Chip key={i} size="sm" variant="flat" color="default">{c}</Chip>)}
              </div>
            )}
          </div>

          <Pair label="KOL / 網紅適配建議">{solution?.kolFit ?? dash}</Pair>

          <Divider />

          <div>
            <Chip size="sm" variant="flat" className="mb-2">內容切角</Chip>
            {contentAngles.length === 0 ? <EmptyHint label="尚未設定" inline /> : (
              <ol className="list-decimal list-inside text-small text-default-700 space-y-1">
                {contentAngles.map((c, i) => <li key={i}>{c}</li>)}
              </ol>
            )}
          </div>

          <div>
            <Chip size="sm" variant="flat" className="mb-2">KPI 成效指標</Chip>
            {kpis.length === 0 ? <EmptyHint label="尚未設定" inline /> : (
              <div className="flex gap-2 flex-wrap">
                {kpis.map((k, i) => <Chip key={i} size="sm" variant="flat" color="default" startContent={<FontAwesomeIcon icon={faChartLine} className="text-tiny ml-1" />}>{k}</Chip>)}
              </div>
            )}
          </div>

          <Divider />

          <div>
            <Chip size="sm" variant="flat" className="mb-2">策略亮點</Chip>
            {highlights.length === 0 ? <EmptyHint label="尚未設定" inline /> : (
              <ul className="list-disc list-inside text-small text-default-700 space-y-1">
                {highlights.map((h, i) => <li key={i}>{h}</li>)}
              </ul>
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
