/**
 * CampaignSetupForm — 活動的設定：一段話＋搭配什麼 → AI 推斷類型與通路 → 排出企劃。
 *
 * 2026-09-30：從舊的 CampaignWorkspace 拆出來。策略層活動頁（CampaignStage）在兩個
 * 地方用它：還沒有企劃時放在右邊地圖上；有企劃之後收進「調整設定」視窗。同一個
 * 問題只有一種長相。
 *
 * 規則照舊（見 CampaignWorkspace 的歷史說明，2026-09-26）：
 *   · 設定＝一段話。類型／通路由 AI 推斷，猜錯才改。
 *   · 「搭配什麼」使用者選了就以使用者為準，沒選才推斷。
 *   · 存設定與排企劃一步到位——使用者要的是企劃，不是「儲存成功」。
 */
import React from "react";
import { Button, Chip, Textarea, Input } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { trpc } from "../../../../lib/trpc";
import { CHANNEL_META, channelLabel } from "../../../platform/lib/channelMeta";
import { CAMPAIGN_CHANNELS, CAMPAIGN_TYPES, EMPTY_CAMPAIGN_SETTINGS, type CampaignSettings } from "../../../strategy/lib/campaign/campaignSchema";
import { briefFromEvent } from "../../../strategy/lib/campaign/campaignBasis";
import { scopeValueFrom, UNDECIDED_SCOPE, type ProductScopeValue } from "../../../strategy/lib/eventProductScope";
import EventProductScopePicker from "../../../strategy/components/events/EventProductScopePicker";

export default function CampaignSetupForm({ eventId, data, brandProducts, hasPlan, en, onPlanned, onOpenKolBrief, autoBrief, autoFrom = "positioning", onAutoDrafting }: {
  eventId: number;
  /** campaign.get 的結果 */
  data: any;
  brandProducts: Array<{ id: number; name: string }>;
  hasPlan: boolean;
  en: boolean;
  onPlanned?: () => void;
  /** 選了網紅時，打開「網紅任務說明單」（2026-10-01）。 */
  onOpenKolBrief?: () => void;
  /**
   * 活動定位剛跑完帶過來的那段話（2026-10-05 CJ「定位完成後，可以直接到左邊對話右邊企劃草稿的
   * 地方嗎」）：有給、而且還沒有企劃，就不等使用者按——推斷設定、存、排企劃一路做完。排出來的
   * 是草稿，類型與通路猜錯可以在「調整設定」改，或直接跟左邊的內容企劃說。失敗就停在這張表單。
   */
  autoBrief?: string;
  /** autoBrief 是哪裡來的：活動定位，或新增活動視窗填的內容（2026-10-08）。只影響說明文字。 */
  autoFrom?: "positioning" | "event";
  onAutoDrafting?: (running: boolean) => void;
}) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const utils = (trpc as any).useUtils();

  const [brief, setBrief] = React.useState("");
  const [settings, setSettings] = React.useState<CampaignSettings>(EMPTY_CAMPAIGN_SETTINGS);
  const [scopeValue, setScopeValue] = React.useState<ProductScopeValue>(UNDECIDED_SCOPE);
  // infer 的回呼要知道「使用者有沒有自己選過」——讀 ref，不讀 render 當下的閉包。
  const scopeRef = React.useRef(scopeValue);
  scopeRef.current = scopeValue;
  const [dirty, setDirty] = React.useState(false);
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    if (!data || dirty) return;
    const s = { ...EMPTY_CAMPAIGN_SETTINGS, ...(data.settings ?? {}) };
    // 舊設定勾過「要找網紅合作」＝網紅通路（2026-10-01 起網紅是通路；server 產企劃時也這樣認）。
    if (s.partners?.kol && !s.channels.includes("kol")) s.channels = [...s.channels, "kol"];
    if (s.partners?.cobrand && !s.channels.includes("cobrand")) s.channels = [...s.channels, "cobrand"];
    setSettings(s);
    // 還沒寫過優惠機制：先帶新增活動時填的名稱與主題，不讓使用者對著空格重寫一次（2026-10-08）。
    setBrief((prev) => prev || s.mechanic || briefFromEvent(data.event));
    setScopeValue(scopeValueFrom(data.productScope, (data.products ?? []).map((p: any) => p.id)));
  }, [data]);   // eslint-disable-line react-hooks/exhaustive-deps

  const inferMut = (trpc as any).campaign.infer.useMutation({
    onSuccess: (r: any) => {
      // 類型、通路在新增活動時選過就照選的，沒選才用推斷的（2026-10-08）。
      setSettings((s) => ({ ...s, type: s.type || r.type, mechanic: r.mechanic || brief, goal: r.goal ?? "", channels: s.channels.length ? s.channels : r.channels }));
      if (scopeRef.current.scope === null) setScopeValue(scopeValueFrom(r.productScope, r.productIds ?? []));
      setDirty(true);
    },
    onError: (e: any) => setErr(e?.message ?? ""),
  });
  const saveSettingsMut = (trpc as any).campaign.saveSettings.useMutation({
    onError: (e: any) => setErr(e?.message ?? ""),
  });
  const generateMut = (trpc as any).campaign.generate.useMutation({
    onSuccess: () => { setDirty(false); utils?.campaign?.get?.invalidate?.({ eventId }); onPlanned?.(); },
    onError: (e: any) => setErr(e?.message ?? ""),
  });

  const [auto, setAuto] = React.useState<"idle" | "running" | "failed">("idle");
  const autoFired = React.useRef(false);
  React.useEffect(() => {
    if (!autoBrief || hasPlan || autoFired.current || !data) return;
    autoFired.current = true;
    const stop = () => { setAuto("failed"); onAutoDrafting?.(false); };
    const done = () => { setAuto("idle"); onAutoDrafting?.(false); };
    setAuto("running");
    onAutoDrafting?.(true);
    const s: CampaignSettings = { ...EMPTY_CAMPAIGN_SETTINGS, ...(data.settings ?? {}) };
    // 設定早就齊了（只是還沒排）：直接排，不重猜一次。
    if (s.type && s.channels.length > 0 && s.mechanic?.trim()) {
      generateMut.mutate({ eventId }, { onSuccess: done, onError: stop });
      return;
    }
    const text = (s.mechanic || autoBrief).trim();
    setBrief(text);
    inferMut.mutate({ eventId, brief: text }, {
      onError: stop,
      onSuccess: (r: any) => {
        // 使用者選過搭配什麼就照他的，沒選才用推斷的（跟手動那條路同一條規則）。
        const picked = scopeValueFrom(data.productScope, (data.products ?? []).map((p: any) => p.id));
        const sv = picked.scope === null ? scopeValueFrom(r.productScope, r.productIds ?? []) : picked;
        const { productScope: _stale, ...rest } = s;
        const next = {
          ...rest, type: s.type || r.type, mechanic: (r.mechanic || text).trim().slice(0, 600), goal: r.goal ?? "",
          channels: s.channels.length ? s.channels : r.channels,
          ...(sv.scope ? { productScope: sv.scope } : {}),
        };
        saveSettingsMut.mutate({ eventId, settings: next, productIds: sv.productIds }, {
          onError: stop,
          onSuccess: () => generateMut.mutate({ eventId }, { onSuccess: done, onError: stop }),
        });
      },
    });
  }, [autoBrief, data, hasPlan]);   // eslint-disable-line react-hooks/exhaustive-deps

  const configured = !!settings.type && settings.channels.length > 0;
  const ready = configured && !!(settings.mechanic || brief).trim();
  const busy = inferMut.isPending || saveSettingsMut.isPending || generateMut.isPending;
  const patch = (next: Partial<CampaignSettings>) => { setSettings((s) => ({ ...s, ...next })); setDirty(true); };

  const saveAndGenerate = () => {
    setErr("");
    const { productScope: _stale, ...rest } = settings;
    const next = {
      ...rest, mechanic: (settings.mechanic || brief).trim(),
      ...(scopeValue.scope ? { productScope: scopeValue.scope } : {}),
    };
    saveSettingsMut.mutate({ eventId, settings: next, productIds: scopeValue.productIds }, {
      onSuccess: () => generateMut.mutate({ eventId }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {auto === "running" && (
        <p className="text-small text-default-600 leading-relaxed" role="status">
          {autoFrom === "event"
            ? L("活動建好了。正在用你剛填的內容、品牌資料與搭配的產品排出第一版企劃草稿，大約 30 秒——排好之後，左邊可以直接用對話修改。",
                "Event created. Building a first draft plan from what you entered, your brand and its products (about 30s) — then edit it by chatting on the left.")
            : L("活動定位完成了。正在依定位排出第一版企劃草稿，大約 30 秒——排好之後，左邊可以直接用對話修改。",
                "Positioning is done. Building a first draft plan from it (about 30s) — then edit it by chatting on the left.")}
        </p>
      )}
      {auto === "failed" && (
        <p className="text-small text-default-600 leading-relaxed">
          {autoFrom === "event"
            ? L("沒能自動排出企劃。下面是你新增活動時填的內容，補上優惠與期限後再按一次。",
                "Couldn't build the plan automatically. The text below is what you entered when creating the event — add the offer and dates, then try again.")
            : L("沒能自動排出企劃。下面是從活動定位帶過來的說明，補上優惠與期限後再按一次。",
                "Couldn't build the plan automatically. The text below came from your positioning — add the offer and dates, then try again.")}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <p className="text-medium font-semibold">{L("這檔活動在賣什麼、優惠是什麼？", "What's on offer?")}</p>
        <Textarea
          value={brief}
          onValueChange={(v) => { setBrief(v); setDirty(true); }}
          minRows={2} maxRows={6} maxLength={800} variant="bordered" radius="md"
          placeholder={L("例：中秋檔期，橫膈牛排＋厚切牛舌組合早鳥 8 折，9/20–9/28，數量有限",
                         "e.g. Mid-Autumn bundle, 20% off early bird, 9/20–9/28, limited stock")}
        />
      </div>

      <EventProductScopePicker
        products={brandProducts} value={scopeValue} en={en} isDisabled={busy}
        onChange={(v) => { setScopeValue(v); setDirty(true); }}
      />

      {configured ? (
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-tiny text-default-500 mb-2">{L("活動類型", "Type")}</p>
            <div className="flex gap-1.5 flex-wrap">
              {CAMPAIGN_TYPES.map((t) => (
                <Chip key={t.id} size="sm" color="default" className="cursor-pointer"
                  variant={settings.type === t.id ? "solid" : "flat"} onClick={() => patch({ type: t.id })}>
                  {en ? t.en : t.zh}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <p className="text-tiny text-default-500 mb-2">{L("要發的通路", "Channels")}</p>
            <div className="flex gap-1.5 flex-wrap">
              {CAMPAIGN_CHANNELS.filter((c) => CHANNEL_META[c]).map((c) => {
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
            {settings.channels.includes("kol") && onOpenKolBrief && (
              <button type="button" onClick={onOpenKolBrief}
                className="mt-2 text-tiny text-default-600 hover:text-foreground underline underline-offset-2">
                {L("填網紅任務說明單（名單或類型、時程、條款…）", "Fill in the influencer brief (who, timeline, terms…)")}
              </button>
            )}
          </div>
          {settings.type === "offline" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {([["venue", "地點", "Venue"], ["sessions", "場次", "Sessions"], ["signupUrl", "報名連結", "Sign-up URL"]] as const).map(([k, zh, e2]) => (
                <Input key={k} size="sm" variant="bordered" radius="md" label={L(zh, e2)} labelPlacement="outside"
                  value={(settings as any)[k] ?? ""} onValueChange={(v) => patch({ [k]: v } as any)} />
              ))}
            </div>
          )}
          {/* 2026-10-01：網紅、異業合作改成上面的通路（企劃裡各一條線），原本的兩個勾選拿掉。 */}
        </div>
      ) : (
        <p className="text-tiny text-default-500 leading-relaxed">
          {L("寫完按「下一步」，我會判斷活動類型與要發的通路——猜錯可以改。",
             "We'll work out the type and channels from this — you can correct it.")}
        </p>
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
              : hasPlan ? L("依現在的設定重排", "Re-plan") : L("排出宣傳企劃", "Build the plan")}
          </Button>
        )}
        {hasPlan && configured && !generateMut.isPending && (
          <span className="text-tiny text-default-500">{L("重排會換掉目前的企劃；已經寫好的貼文還在歷史紀錄裡。", "Re-planning replaces the current plan; posts already written stay in your history.")}</span>
        )}
        {err && <span className="text-tiny text-danger">{err.slice(0, 200)}</span>}
      </div>
    </div>
  );
}
