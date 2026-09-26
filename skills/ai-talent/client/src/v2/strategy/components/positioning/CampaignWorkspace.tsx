/**
 * CampaignWorkspace — 活動的「設定 + 宣傳企劃」。**策略層只排，不寫。**
 *
 * 2026-09-25（CJ「在策略層，只做完活動的企劃和編輯，活動撰寫都還是在內容層」
 * ＋「每一格在策略層要也放一顆『去寫這篇』」）
 * 2026-09-26（CJ「顯示方式很複雜」→「請設計恰當，保持 notion style 一致性」）：
 *
 * 第一版在寫出第一個字之前要面對約 70 個可點的元素。這一版收成兩件事：
 *   · 設定＝**一段話**（這檔在賣什麼、優惠是什麼）。類型／通路／產品由 AI 推斷，
 *     只呈現成一行 chip；要改才點右上角齒輪展開。
 *   · 企劃＝**一條清單**，一行是「日期・階段・平台・要發什麼」＋一顆「寫」。
 *     換卡、改日期、這篇不做收進行末的「⋯」。
 *
 * 設計系統（project_design_system）：顏色只有功能性意義——primary 只給「下一步
 * 動作」，success 只給「已完成」，其餘一律 default。沒有 hex、沒有裝飾色、沒有
 * shadow；階層靠字重與留白。平台不用品牌色區分，用 FA icon + default 文字。
 *
 * 分層沒有變：這一頁沒有任何寫作介面，「寫」是通往內容層活動 tray 的門。
 */
import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Button, Card, CardBody, Chip, Textarea, Input, Checkbox, Tooltip, Spinner, Divider,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faGear, faEllipsis, faCheck, faPenNib, faArrowRight, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import { CHANNEL_META, channelLabel } from "../../../content/lib/channelMeta";
import {
  CAMPAIGN_TYPES, campaignTypeOf, phaseOf,
  EMPTY_CAMPAIGN_SETTINGS,
  type CampaignSettings, type CampaignPlanItem,
} from "../../lib/campaignSchema";

export default function CampaignWorkspace({ eventId, brandId }: { eventId: number; brandId: number | null }) {
  const { lang } = useLang();
  const en = lang === "en";
  const L = (zh: string, e: string) => (en ? e : zh);
  const navigate = useNavigate();
  const utils = (trpc as any).useUtils();

  const q = (trpc as any).campaign.get.useQuery({ eventId }, { refetchOnWindowFocus: false });
  const productsQ = (trpc as any).product?.list?.useQuery?.(
    { brandId: brandId ?? undefined }, { enabled: !!brandId, refetchOnWindowFocus: false },
  ) ?? { data: [] };

  const [brief, setBrief] = React.useState("");
  const [settings, setSettings] = React.useState<CampaignSettings>(EMPTY_CAMPAIGN_SETTINGS);
  const [productIds, setProductIds] = React.useState<number[]>([]);
  const [plan, setPlan] = React.useState<{ smp: string; items: CampaignPlanItem[]; kol?: any; cobrand?: any } | null>(null);
  const [expanded, setExpanded] = React.useState(false);
  const [openRow, setOpenRow] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    if (!q.data) return;
    if (!dirty) {
      const s = { ...EMPTY_CAMPAIGN_SETTINGS, ...(q.data.settings ?? {}) };
      setSettings(s);
      setBrief((prev) => prev || s.mechanic || "");
      setProductIds((q.data.products ?? []).map((p: any) => p.id));
    }
    setPlan(q.data.plan ?? null);
  }, [q.data]);   // eslint-disable-line react-hooks/exhaustive-deps

  const inferMut = (trpc as any).campaign.infer.useMutation({
    onSuccess: (r: any) => {
      setSettings((s) => ({ ...s, type: r.type, mechanic: r.mechanic || brief, goal: r.goal ?? "", channels: r.channels }));
      setProductIds(r.productIds ?? []);
      setDirty(true);
    },
    onError: (e: any) => setErr(e?.message ?? ""),
  });
  const saveSettingsMut = (trpc as any).campaign.saveSettings.useMutation({
    onSuccess: () => { setDirty(false); utils?.campaign?.get?.invalidate?.({ eventId }); },
    onError: (e: any) => setErr(e?.message ?? ""),
  });
  const generateMut = (trpc as any).campaign.generate.useMutation({
    onSuccess: (p: any) => { setPlan(p); utils?.campaign?.get?.invalidate?.({ eventId }); },
    onError: (e: any) => setErr(e?.message ?? ""),
  });
  const savePlanMut = (trpc as any).campaign.savePlan.useMutation({
    onSuccess: () => utils?.campaign?.get?.invalidate?.({ eventId }),
    onError: (e: any) => setErr(e?.message ?? ""),
  });

  const items = plan?.items ?? [];
  const live = items.filter((i) => i.enabled);
  const done = live.filter((i) => !!i.outputId).length;
  const configured = !!settings.type && settings.channels.length > 0;
  const ready = configured && !!(settings.mechanic || brief).trim();
  const busy = inferMut.isPending || saveSettingsMut.isPending || generateMut.isPending;

  const patch = (next: Partial<CampaignSettings>) => { setSettings((s) => ({ ...s, ...next })); setDirty(true); };
  const patchItem = (id: string, next: Partial<CampaignPlanItem>) =>
    setPlan((p) => (p ? { ...p, items: p.items.map((i) => (i.id === id ? { ...i, ...next } : i)) } : p));

  const goWrite = (itemId?: string) => {
    const sp = new URLSearchParams();
    if (brandId) sp.set("b", String(brandId));
    sp.set("e", String(eventId));
    if (itemId) sp.set("item", itemId); else sp.set("start", "1");
    navigate(`/campaigns?${sp.toString()}`);
  };

  /** 一步到位：存設定 → 排企劃。使用者要的是企劃，不是「儲存成功」。 */
  const saveAndGenerate = () => {
    setErr("");
    const next = { ...settings, mechanic: (settings.mechanic || brief).trim() };
    saveSettingsMut.mutate({ eventId, settings: next, productIds }, {
      onSuccess: () => generateMut.mutate({ eventId }),
    });
  };

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-3 py-10">
        <Spinner size="sm" />
        <span className="text-small text-default-500">{L("載入中…", "Loading…")}</span>
      </div>
    );
  }
  if (q.error) {
    return (
      <Card shadow="none" radius="md" className="border border-divider">
        <CardBody className="gap-3 p-5">
          <p className="text-small text-danger">{String(q.error?.message ?? "").slice(0, 200)}</p>
          <Button size="sm" variant="bordered" className="self-start" onPress={() => q.refetch?.()}>
            {L("重試", "Retry")}
          </Button>
        </CardBody>
      </Card>
    );
  }

  const ev = q.data?.event;
  const typeSpec = campaignTypeOf(settings.type);
  const productNames = productIds
    .map((id) => ((productsQ.data as any[]) ?? []).find((p: any) => p.id === id)?.name)
    .filter(Boolean) as string[];

  return (
    <div className="max-w-[880px] flex flex-col gap-6">
      {/* ── Page header（eyebrow + h1 + meta）───────────────────────── */}
      <header>
        <Chip size="sm" variant="flat" color="default" className="uppercase tracking-wider mb-2">
          {L("宣傳企劃", "Campaign plan")}
        </Chip>
        <h1 className="text-3xl font-semibold tracking-tight">{ev?.name}</h1>
        <p className="text-tiny text-default-500 mt-2">
          {ev?.startAt ? `${ev.startAt} → ${ev.endAt ?? "?"}` : L("尚未設定期間", "No dates set")}
          {plan ? `　·　${L(`${live.length} 篇 · 已寫 ${done}`, `${live.length} posts · ${done} written`)}` : ""}
        </p>
      </header>

      {/* ── 設定：一段話 ───────────────────────────────────────────── */}
      <Card shadow="none" radius="md" className="border border-divider">
        <CardBody className="gap-3 p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-medium font-semibold">
              {L("這檔活動在賣什麼、優惠是什麼？", "What's on offer?")}
            </h2>
            {configured && (
              <Tooltip content={L("調整活動類型 / 通路 / 產品", "Adjust type, channels, products")} placement="top">
                <Button isIconOnly size="sm" variant="light" aria-label={L("設定", "Settings")}
                  onPress={() => setExpanded((v) => !v)}>
                  <FontAwesomeIcon icon={faGear} className="text-default-500" />
                </Button>
              </Tooltip>
            )}
          </div>

          <Textarea
            value={brief}
            onValueChange={(v) => { setBrief(v); setDirty(true); }}
            minRows={2} maxRows={6} maxLength={800} variant="bordered" radius="md"
            placeholder={L("例：中秋檔期，橫膈牛排＋厚切牛舌組合早鳥 8 折，9/20–9/28，數量有限",
                           "e.g. Mid-Autumn bundle, 20% off early bird, 9/20–9/28, limited stock")}
          />

          {configured ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              {typeSpec && (
                <Chip size="sm" variant="flat" color="default">{en ? typeSpec.en : typeSpec.zh}</Chip>
              )}
              {settings.channels.map((c) => (
                <Chip key={c} size="sm" variant="flat" color="default"
                  startContent={<FontAwesomeIcon icon={CHANNEL_META[c]?.icon ?? faPenNib} className="text-tiny text-default-500 ml-1" />}>
                  {channelLabel(c, en)}
                </Chip>
              ))}
              {productNames.map((n) => (
                <Chip key={n} size="sm" variant="flat" color="default">{n}</Chip>
              ))}
            </div>
          ) : (
            <p className="text-tiny text-default-500 leading-relaxed">
              {L("寫完按「下一步」，我會判斷活動類型、要發的通路與適用產品——猜錯可以改。",
                 "We'll work out the type, channels and products from this — you can correct it.")}
            </p>
          )}

          {/* 細項：預設收起來。第一版把這些一開場就全部攤開。 */}
          {expanded && (
            <>
              <Divider className="my-1" />
              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-tiny text-default-500 mb-2">{L("活動類型", "Type")}</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {CAMPAIGN_TYPES.map((t) => (
                      <Chip key={t.id} size="sm" variant={settings.type === t.id ? "solid" : "flat"}
                        color="default" className="cursor-pointer"
                        onClick={() => patch({ type: t.id })}>
                        {en ? t.en : t.zh}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-tiny text-default-500 mb-2">{L("要發的通路", "Channels")}</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {Object.keys(CHANNEL_META).map((c) => {
                      const on = settings.channels.includes(c);
                      return (
                        <Chip key={c} size="sm" variant={on ? "solid" : "flat"} color="default" className="cursor-pointer"
                          startContent={<FontAwesomeIcon icon={CHANNEL_META[c]!.icon} className={`text-tiny ml-1 ${on ? "" : "text-default-500"}`} />}
                          onClick={() => patch({ channels: on ? settings.channels.filter((x) => x !== c) : [...settings.channels, c] })}>
                          {channelLabel(c, en)}
                        </Chip>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="text-tiny text-default-500 mb-2">{L("適用產品", "Products")}</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {((productsQ.data as any[]) ?? []).map((p: any) => {
                      const on = productIds.includes(p.id);
                      return (
                        <Chip key={p.id} size="sm" variant={on ? "solid" : "flat"} color="default" className="cursor-pointer"
                          onClick={() => { setDirty(true); setProductIds((ids) => on ? ids.filter((x) => x !== p.id) : [...ids, p.id]); }}>
                          {p.name}
                        </Chip>
                      );
                    })}
                    {!((productsQ.data as any[]) ?? []).length && (
                      <span className="text-tiny text-default-500">{L("這個品牌還沒有產品", "No products yet")}</span>
                    )}
                  </div>
                </div>
                {settings.type === "offline" && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {([["venue", "地點", "Venue"], ["sessions", "場次", "Sessions"], ["signupUrl", "報名連結", "Sign-up URL"]] as const).map(([k, zh, e2]) => (
                      <Input key={k} size="sm" variant="bordered" radius="md" label={L(zh, e2)} labelPlacement="outside"
                        value={(settings as any)[k] ?? ""} onValueChange={(v) => patch({ [k]: v } as any)} />
                    ))}
                  </div>
                )}
                <div className="flex gap-5 flex-wrap">
                  {([["kol", "要找網紅合作", "Influencer collab"], ["cobrand", "要做異業合作", "Co-branding"]] as const).map(([k, zh, e2]) => (
                    <Checkbox key={k} size="sm" isSelected={!!(settings.partners as any)?.[k]}
                      onValueChange={(v) => patch({ partners: { ...(settings.partners ?? {}), [k]: v } })}>
                      <span className="text-small">{L(zh, e2)}</span>
                    </Checkbox>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            {!configured ? (
              <Button color="primary" size="sm" radius="md"
                isDisabled={!brief.trim() || busy} isLoading={inferMut.isPending}
                endContent={!inferMut.isPending ? <FontAwesomeIcon icon={faArrowRight} /> : undefined}
                onPress={() => { setErr(""); inferMut.mutate({ eventId, brief }); }}>
                {L("下一步", "Next")}
              </Button>
            ) : (
              <Button color="primary" size="sm" radius="md"
                isDisabled={!ready || busy} isLoading={generateMut.isPending || saveSettingsMut.isPending}
                onPress={saveAndGenerate}>
                {generateMut.isPending ? L("排企劃中…約 20 秒", "Planning… ~20s")
                  : plan ? L("依現在的設定重排", "Re-plan") : L("排出宣傳企劃", "Build the plan")}
              </Button>
            )}
            {err && <span className="text-tiny text-danger">{err.slice(0, 200)}</span>}
          </div>
        </CardBody>
      </Card>

      {/* ── 企劃：一條清單 ─────────────────────────────────────────── */}
      {plan && (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="text-medium font-semibold">{plan.smp}</h2>
            <p className="text-tiny text-default-500">
              {L("一行一篇。按「寫」會在內容層打開這一篇。", "One row per post. “Write” opens it in the content layer.")}
            </p>
          </div>

          <Card shadow="none" radius="md" className="border border-divider">
            <CardBody className="p-0">
              {items.map((i, idx) => {
                const ph = phaseOf(i.phase);
                const open = openRow === i.id;
                const ch = CHANNEL_META[i.platform];
                return (
                  <div key={i.id} className={idx === 0 ? "" : "border-t border-divider"}>
                    <div className={`flex items-center gap-3 px-4 py-2.5 ${i.enabled ? "" : "opacity-50"}`}>
                      <span className="text-tiny text-default-500 tabular-nums w-11 shrink-0">
                        {i.date.slice(5).replace("-", "/")}
                      </span>
                      <span className="text-tiny text-default-500 w-12 shrink-0">{ph ? (en ? ph.en : ph.zh) : ""}</span>
                      <Tooltip content={channelLabel(i.platform, en)} placement="top">
                        <span className="w-4 shrink-0 text-center">
                          <FontAwesomeIcon icon={ch?.icon ?? faPenNib} className="text-tiny text-default-500" />
                        </span>
                      </Tooltip>
                      <input
                        value={i.angle}
                        onChange={(e) => patchItem(i.id, { angle: e.target.value })}
                        aria-label={L("這一篇要講什麼", "What this post says")}
                        className="flex-1 min-w-0 text-small bg-transparent outline-none focus:underline underline-offset-4 decoration-default-300"
                      />
                      {i.outputId ? (
                        <Button size="sm" variant="light" radius="md" className="shrink-0"
                          startContent={<FontAwesomeIcon icon={faCheck} className="text-success" />}
                          onPress={() => navigate(`/run/${i.outputId}`)}>
                          {L("看", "View")}
                        </Button>
                      ) : (
                        <Button size="sm" color="primary" radius="md" className="shrink-0"
                          isDisabled={!i.enabled} onPress={() => goWrite(i.id)}>
                          {L("寫", "Write")}
                        </Button>
                      )}
                      <Button isIconOnly size="sm" variant="light" className="shrink-0"
                        aria-label={L("更多", "More")} onPress={() => setOpenRow(open ? null : i.id)}>
                        <FontAwesomeIcon icon={faEllipsis} className="text-default-500" />
                      </Button>
                    </div>

                    {/* 「⋯」展開才出現——排企劃的當下不該同時面對這三件事 */}
                    {open && (
                      <div className="flex items-center gap-3 flex-wrap px-4 pb-3 pl-[68px]">
                        <Input type="date" size="sm" variant="bordered" radius="md" className="w-[160px]"
                          aria-label={L("日期", "Date")} value={i.date}
                          onValueChange={(v) => patchItem(i.id, { date: v })} />
                        <span className="text-tiny text-default-500">
                          {L("用的卡：", "Card: ")}{i.taskLabel}
                        </span>
                        {i.repaired && (
                          <Chip size="sm" variant="flat" color="warning"
                            startContent={<FontAwesomeIcon icon={faTriangleExclamation} className="text-tiny ml-1" />}>
                            {L("系統補選", "auto-picked")}
                          </Chip>
                        )}
                        <Button size="sm" variant="bordered" radius="md"
                          onPress={() => patchItem(i.id, { enabled: !i.enabled })}>
                          {i.enabled ? L("這篇不做", "Skip") : L("放回企劃", "Put back")}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardBody>
          </Card>

          {/* 合作：勾了才有 */}
          {(plan.kol || plan.cobrand) && (
            <div className="flex flex-col gap-2">
              {([["kol", "網紅合作", "Influencer collab"], ["cobrand", "異業合作", "Co-branding"]] as const).map(([k, zh, e2]) => {
                const b = (plan as any)[k];
                if (!b) return null;
                return (
                  <Card key={k} shadow="none" radius="md" className="border border-divider">
                    <CardBody className="gap-2 p-4">
                      <details>
                        <summary className="text-small font-medium cursor-pointer">
                          {L(zh, e2)}
                          <span className="text-tiny text-default-500 font-normal">　{b.summary}</span>
                        </summary>
                        <ul className="mt-2 pl-5 list-disc flex flex-col gap-1">
                          {(b.steps ?? []).map((st: any) => (
                            <li key={st.id} className="text-small leading-relaxed">
                              {st.text}
                              {st.taskId && <span className="text-tiny text-default-500">（{st.taskLabel}）</span>}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <Button color="primary" size="sm" radius="md" onPress={() => goWrite()}>
              {L(`開始撰寫（還有 ${live.length - done} 篇）`, `Start writing (${live.length - done} left)`)}
            </Button>
            <Button size="sm" variant="bordered" radius="md" isLoading={savePlanMut.isPending}
              onPress={() => savePlanMut.mutate({ eventId, plan: { ...plan, items } })}>
              {L("儲存企劃", "Save plan")}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
