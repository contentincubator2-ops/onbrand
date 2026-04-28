/**
 * MediaHubPage — 媒體中心 / Media Hub
 *
 * "Canva Print Center" of Marketing OS：把策略、文案、提案
 * 變成可上架的投放包（Meta Ads CSV / IG schedule / KOL brief / etc）。
 *
 * 3-step wizard：
 *   1. 挑素材（從 brand brain / sessionStorage 帶入 / 手動貼）
 *   2. 挑通路（6 個，Meta Ads = ready，其餘 = preview）
 *   3. 設定 + 出稿（預算/排期/受眾 → LLM 生 5 變體 → 預覽 + 下載 CSV）
 */
import React, { useEffect, useMemo, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";

const ACCENT = "#5B3CC8";
const HAIR = "#E5E5E5";
const INK = "#0E0E10";

type Channel = {
  id: string;
  name: string;
  platform: string;
  category: "ads" | "social" | "outreach" | "email";
  status: "ready" | "preview";
  color: string;
  logo: string;
  pitch: string;
  exportFormat: string;
};

type BrandAsset = {
  id: string;
  source: "brand-brain";
  category: string;
  title: string;
  content: string;
};

type SessionAsset = {
  id: string;
  source: "quick-task" | "boardroom" | "manual";
  title: string;
  content: string;
};

const SESSION_KEY = "media-hub-pending-asset";

export default function MediaHubPage() {
  const { brands, brandId } = useOutletContext<ShellOutletCtx>();
  const currentBrand = useMemo(
    () => brands.find((b: any) => b.id === brandId) ?? null,
    [brands, brandId]
  );

  const [searchParams] = useSearchParams();

  // Wizard state
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [pickedAsset, setPickedAsset] = useState<{
    title: string;
    content: string;
    source: string;
  } | null>(null);
  const [pickedChannelId, setPickedChannelId] = useState<string | null>(null);
  const [config, setConfig] = useState({
    objective: "conversion" as
      | "awareness"
      | "traffic"
      | "conversion"
      | "engagement"
      | "leadgen",
    dailyBudget: 500,
    durationDays: 14,
    audience: "",
    tone: "",
  });

  // Server data
  const channelsQuery =
    (trpc as any).mediaHub?.listChannels?.useQuery?.(undefined, {
      refetchOnWindowFocus: false,
    }) ?? { data: [], isLoading: false };
  const channels: Channel[] = (channelsQuery.data as Channel[]) ?? [];

  const brandAssetsQuery =
    currentBrand && (trpc as any).mediaHub?.listBrandAssets?.useQuery?.(
      { brandId: currentBrand.id },
      { refetchOnWindowFocus: false }
    );
  const brandAssets: BrandAsset[] = brandAssetsQuery?.data ?? [];

  const prepareMut = (trpc as any).mediaHub?.prepareCampaign?.useMutation?.();
  const [result, setResult] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Auto-import from sessionStorage (e.g. when /ai pipes asset over)
  useEffect(() => {
    const fromQuery = searchParams.get("from");
    const raw =
      typeof window !== "undefined" ? sessionStorage.getItem(SESSION_KEY) : null;
    if (raw && (fromQuery === "quick-task" || fromQuery === "boardroom")) {
      try {
        const parsed = JSON.parse(raw) as SessionAsset;
        setPickedAsset({
          title: parsed.title,
          content: parsed.content,
          source: parsed.source,
        });
        setStep(2);
        sessionStorage.removeItem(SESSION_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [searchParams]);

  const pickedChannel = channels.find((c) => c.id === pickedChannelId) ?? null;

  const onPrepare = async () => {
    if (!pickedAsset || !pickedChannel) return;
    setErr(null);
    setResult(null);
    try {
      const r = await prepareMut.mutateAsync({
        channelId: pickedChannel.id,
        brandName: currentBrand?.name ?? undefined,
        brandId: currentBrand?.id ?? undefined,
        assetText: pickedAsset.content,
        config,
      });
      setResult(r);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  };

  const onReset = () => {
    setStep(1);
    setPickedAsset(null);
    setPickedChannelId(null);
    setResult(null);
    setErr(null);
  };

  return (
    <main className="bg-white pb-24" style={{ color: INK }}>
      {/* HERO */}
      <section className="border-b" style={{ borderColor: HAIR }}>
        <div className="max-w-[1280px] mx-auto px-8 pt-16 pb-10">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div>
              <div
                className="font-semibold text-tiny tracking-[0.32em] uppercase"
                style={{ color: "#888" }}
              >
                MEDIA HUB · 派發中心
              </div>
              <h1 className="mt-3 font-semibold text-5xl leading-[1.02] tracking-[-0.025em]">
                媒體中心
              </h1>
              <p
                className="mt-3 text-medium leading-relaxed"
                style={{ color: "#444", maxWidth: 680 }}
              >
                把策略變成投放，把文案變成排程。
                <br />
                挑一份素材 → 挑通路 → 設定預算 → 拿到一包可直接上架的檔案。
              </p>
            </div>
            {currentBrand && (
              <div
                className="flex items-center gap-3 px-4 py-2.5"
                style={{ border: `1px solid ${INK}`, background: "#FAFAFA" }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: ACCENT, boxShadow: `0 0 8px ${ACCENT}` }}
                />
                <div>
                  <div
                    className="text-tiny tracking-[0.22em] uppercase"
                    style={{ color: "#888" }}
                  >
                    BRAND BRAIN · 已連線
                  </div>
                  <div className="text-small font-medium">
                    {currentBrand.name}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Step indicator */}
          <ol className="mt-8 flex items-center gap-3 flex-wrap">
            {[
              { n: 1, label: "挑素材" },
              { n: 2, label: "挑通路" },
              { n: 3, label: "設定 + 出稿" },
            ].map((s, i, arr) => {
              const active = step === s.n;
              const done = step > s.n;
              return (
                <React.Fragment key={s.n}>
                  <li className="flex items-center gap-2">
                    <span
                      className="w-7 h-7 rounded-full flex items-center justify-center text-small font-medium"
                      style={{
                        background: active ? INK : done ? ACCENT : "white",
                        color: active || done ? "white" : "#888",
                        border: `1px solid ${active || done ? "transparent" : HAIR}`,
                      }}
                    >
                      {done ? "✓" : s.n}
                    </span>
                    <span
                      className="text-small"
                      style={{
                        color: active ? INK : done ? ACCENT : "#888",
                        fontWeight: active ? 500 : 400,
                      }}
                    >
                      {s.label}
                    </span>
                  </li>
                  {i < arr.length - 1 && (
                    <span
                      className="w-10 h-px"
                      style={{ background: done ? ACCENT : HAIR }}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </ol>
        </div>
      </section>

      <section className="max-w-[1280px] mx-auto px-8 mt-10">
        {/* STEP 1: pick asset */}
        {step === 1 && (
          <Step1PickAsset
            currentBrandName={currentBrand?.name}
            brandAssets={brandAssets}
            onPick={(a) => {
              setPickedAsset(a);
              setStep(2);
            }}
          />
        )}

        {/* STEP 2: pick channel */}
        {step === 2 && pickedAsset && (
          <Step2PickChannel
            asset={pickedAsset}
            channels={channels}
            isLoading={channelsQuery.isLoading}
            onBack={() => setStep(1)}
            onPick={(c) => {
              setPickedChannelId(c.id);
              setStep(3);
            }}
          />
        )}

        {/* STEP 3: configure + result */}
        {step === 3 && pickedAsset && pickedChannel && (
          <Step3Configure
            asset={pickedAsset}
            channel={pickedChannel}
            config={config}
            setConfig={setConfig}
            onBack={() => setStep(2)}
            onPrepare={onPrepare}
            isPending={!!prepareMut?.isPending}
            err={err}
            result={result}
            onReset={onReset}
            brandName={currentBrand?.name ?? null}
          />
        )}
      </section>
    </main>
  );
}

/* ─────────────────────────── Step 1 ──────────────────────────────── */

function Step1PickAsset({
  currentBrandName,
  brandAssets,
  onPick,
}: {
  currentBrandName?: string;
  brandAssets: BrandAsset[];
  onPick: (a: { title: string; content: string; source: string }) => void;
}) {
  const [manualTitle, setManualTitle] = useState("");
  const [manualText, setManualText] = useState("");

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_360px] gap-8">
      {/* Brand library */}
      <div>
        <h2 className="font-semibold text-xl tracking-[-0.015em] mb-4">
          從 {currentBrandName ?? "品牌"} 大腦挑一份素材
        </h2>
        {brandAssets.length === 0 ? (
          <div
            className="p-8 text-center text-small"
            style={{ border: `1px dashed ${HAIR}`, color: "#888" }}
          >
            這個品牌的 brand brain 還沒有內容。
            <br />
            可以從右邊「手動貼」直接開始。
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {brandAssets.map((a) => (
              <button
                key={a.id}
                onClick={() =>
                  onPick({
                    title: a.title,
                    content: a.content,
                    source: `brain · ${a.category}`,
                  })
                }
                className="text-left p-4 transition hover:bg-[#FAFAFA]"
                style={{ border: `1px solid ${HAIR}` }}
              >
                <div
                  className="text-tiny tracking-[0.22em] uppercase"
                  style={{ color: ACCENT }}
                >
                  {a.category}
                </div>
                <div className="mt-1 font-medium text-small">{a.title}</div>
                <div
                  className="mt-1 text-small line-clamp-3"
                  style={{ color: "#666" }}
                >
                  {a.content}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Manual paste */}
      <div>
        <h3
          className="font-semibold text-medium tracking-[-0.01em] mb-3"
          style={{ color: "#444" }}
        >
          或手動貼一份
        </h3>
        <input
          value={manualTitle}
          onChange={(e) => setManualTitle(e.target.value)}
          placeholder="素材標題（例：夏季新鞋 IG hooks）"
          className="w-full px-3 py-2 text-small outline-none mb-2"
          style={{ border: `1px solid ${HAIR}` }}
        />
        <textarea
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          placeholder="貼上你的文案、提案、策略結論…"
          rows={10}
          className="w-full px-3 py-2 text-small outline-none resize-none"
          style={{ border: `1px solid ${HAIR}` }}
        />
        <button
          onClick={() =>
            onPick({
              title: manualTitle.trim() || "手動素材",
              content: manualText.trim(),
              source: "manual",
            })
          }
          disabled={manualText.trim().length < 10}
          className="mt-3 w-full py-2.5 text-small tracking-[0.2em] uppercase transition disabled:opacity-40"
          style={{ background: INK, color: "white" }}
        >
          用這份 →
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────── Step 2 ──────────────────────────────── */

function Step2PickChannel({
  asset,
  channels,
  isLoading,
  onBack,
  onPick,
}: {
  asset: { title: string; content: string; source: string };
  channels: Channel[];
  isLoading: boolean;
  onBack: () => void;
  onPick: (c: Channel) => void;
}) {
  return (
    <div>
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h2 className="font-semibold text-xl tracking-[-0.015em]">
            把這份素材推到哪個通路？
          </h2>
          <div
            className="mt-2 p-3 max-w-[680px]"
            style={{ border: `1px solid ${HAIR}`, background: "#FAFAFA" }}
          >
            <div
              className="text-tiny tracking-[0.2em] uppercase"
              style={{ color: "#888" }}
            >
              SELECTED ASSET · {asset.source}
            </div>
            <div className="font-medium text-small mt-0.5">
              {asset.title}
            </div>
            <div
              className="mt-1 text-small line-clamp-2"
              style={{ color: "#666" }}
            >
              {asset.content}
            </div>
          </div>
        </div>
        <button
          onClick={onBack}
          className="text-tiny tracking-[0.2em] uppercase px-3 py-1.5 transition hover:bg-[#FAFAFA]"
          style={{ border: `1px solid ${HAIR}`, color: "#666" }}
        >
          ← 換素材
        </button>
      </div>

      {isLoading ? (
        <div className="text-small py-12" style={{ color: "#888" }}>
          載入通路…
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px" style={{ background: HAIR }}>
          {channels.map((c) => {
            const ready = c.status === "ready";
            return (
              <button
                key={c.id}
                onClick={() => ready && onPick(c)}
                disabled={!ready}
                className="text-left p-6 bg-white transition hover:bg-[#FAFAFA] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="flex items-start justify-between">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center font-semibold text-xl"
                    style={{ background: c.color, color: "white" }}
                  >
                    {c.logo}
                  </div>
                  <span
                    className="text-tiny tracking-[0.22em] uppercase px-1.5 py-0.5"
                    style={{
                      background: ready ? ACCENT : "#EEE",
                      color: ready ? "white" : "#888",
                    }}
                  >
                    {ready ? "READY" : "Preview"}
                  </span>
                </div>
                <div className="mt-4 font-medium text-medium tracking-[-0.005em]">
                  {c.name}
                </div>
                <div className="text-tiny" style={{ color: "#888" }}>
                  {c.platform}
                </div>
                <div
                  className="mt-3 text-small leading-snug"
                  style={{ color: "#444" }}
                >
                  {c.pitch}
                </div>
                <div
                  className="mt-4 text-tiny tracking-[0.18em] uppercase"
                  style={{ color: ACCENT }}
                >
                  匯出 · {c.exportFormat}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Step 3 ──────────────────────────────── */

function Step3Configure({
  asset,
  channel,
  config,
  setConfig,
  onBack,
  onPrepare,
  isPending,
  err,
  result,
  onReset,
  brandName,
}: {
  asset: { title: string; content: string; source: string };
  channel: Channel;
  config: any;
  setConfig: (c: any) => void;
  onBack: () => void;
  onPrepare: () => void;
  isPending: boolean;
  err: string | null;
  result: any | null;
  onReset: () => void;
  brandName: string | null;
}) {
  const totalBudget = config.dailyBudget * config.durationDays;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[400px_1fr] gap-6">
      {/* Config column */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-large tracking-[-0.01em]">
            設定投放
          </h2>
          <button
            onClick={onBack}
            className="text-tiny tracking-[0.2em] uppercase px-2.5 py-1 transition hover:bg-[#FAFAFA]"
            style={{ border: `1px solid ${HAIR}`, color: "#666" }}
          >
            ← 換通路
          </button>
        </div>

        <div
          className="p-4 mb-4"
          style={{ border: `1px solid ${channel.color}`, background: `${channel.color}10` }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white"
              style={{ background: channel.color }}
            >
              {channel.logo}
            </div>
            <div>
              <div className="font-medium text-small">{channel.name}</div>
              <div className="text-tiny" style={{ color: "#666" }}>
                {channel.exportFormat}
              </div>
            </div>
          </div>
        </div>

        <Field label="目標">
          <select
            value={config.objective}
            onChange={(e) => setConfig({ ...config, objective: e.target.value })}
            className="w-full px-3 py-2 text-small outline-none"
            style={{ border: `1px solid ${HAIR}` }}
          >
            <option value="awareness">品牌曝光 awareness</option>
            <option value="traffic">導流 traffic</option>
            <option value="engagement">互動 engagement</option>
            <option value="leadgen">名單 leadgen</option>
            <option value="conversion">轉換 conversion</option>
          </select>
        </Field>

        <Field label="日預算 (NT$)">
          <input
            type="number"
            value={config.dailyBudget}
            onChange={(e) => setConfig({ ...config, dailyBudget: Number(e.target.value) })}
            className="w-full px-3 py-2 text-small outline-none"
            style={{ border: `1px solid ${HAIR}` }}
            min={50}
          />
        </Field>

        <Field label="期間（天）">
          <input
            type="number"
            value={config.durationDays}
            onChange={(e) => setConfig({ ...config, durationDays: Number(e.target.value) })}
            className="w-full px-3 py-2 text-small outline-none"
            style={{ border: `1px solid ${HAIR}` }}
            min={1}
            max={90}
          />
        </Field>

        <div
          className="mb-4 px-3 py-2 text-small flex justify-between"
          style={{ background: "#F5F2FE", color: ACCENT }}
        >
          <span className="text-tiny tracking-[0.18em] uppercase">總預算</span>
          <span className="font-medium" style={{ color: INK }}>
            NT$ {totalBudget.toLocaleString()}
          </span>
        </div>

        <Field label="受眾備註（選填）">
          <input
            value={config.audience}
            onChange={(e) => setConfig({ ...config, audience: e.target.value })}
            placeholder="例：25-34 都市女性 / 對精品咖啡有興趣"
            className="w-full px-3 py-2 text-small outline-none"
            style={{ border: `1px solid ${HAIR}` }}
          />
        </Field>

        <Field label="語氣（選填）">
          <input
            value={config.tone}
            onChange={(e) => setConfig({ ...config, tone: e.target.value })}
            placeholder="例：俏皮 / 嚴肅 / Z 世代"
            className="w-full px-3 py-2 text-small outline-none"
            style={{ border: `1px solid ${HAIR}` }}
          />
        </Field>

        <button
          onClick={onPrepare}
          disabled={isPending}
          className="w-full mt-3 py-3 text-small tracking-[0.22em] uppercase disabled:opacity-40 transition"
          style={{ background: INK, color: "white" }}
        >
          {isPending ? "生成中…" : result ? "重新生成" : "🖨 出稿"}
        </button>

        {err && (
          <div
            className="mt-3 px-3 py-2 text-small"
            style={{ background: "#FEF2F2", color: "#B91C1C" }}
          >
            {err}
          </div>
        )}
      </div>

      {/* Preview column */}
      <div>
        {!result ? (
          <div
            className="h-full min-h-[420px] flex items-center justify-center text-center p-8"
            style={{ border: `1px dashed ${HAIR}`, background: "#FAFAFA" }}
          >
            <div>
              <div className="text-5xl mb-2">🖨</div>
              <div
                className="text-tiny tracking-[0.22em] uppercase"
                style={{ color: "#888" }}
              >
                READY TO PRINT
              </div>
              <div className="mt-2 font-semibold text-xl tracking-[-0.015em]">
                按右邊「出稿」開始生成
              </div>
              <div
                className="mt-2 text-small"
                style={{ color: "#666", maxWidth: 380 }}
              >
                我會把「{asset.title}」用 {channel.name} 的格式包好，
                <br />
                生 5 組 ad copy 變體 + 受眾建議 + 可上傳的 CSV
              </div>
            </div>
          </div>
        ) : (
          <ResultPanel
            result={result}
            channel={channel}
            assetTitle={asset.title}
            brandName={brandName}
            onReset={onReset}
          />
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <div className="text-tiny mb-1" style={{ color: "#666" }}>
        {label}
      </div>
      {children}
    </label>
  );
}

/* ─────────────────────────── Result panel ────────────────────────── */

function ResultPanel({
  result,
  channel,
  assetTitle,
  brandName,
  onReset,
}: {
  result: any;
  channel: Channel;
  assetTitle: string;
  brandName: string | null;
  onReset: () => void;
}) {
  const downloadCsv = () => {
    if (!result.csvRows) return;
    const csv = result.csvRows
      .map((row: string[]) =>
        row
          .map((cell) => {
            const s = String(cell ?? "");
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(",")
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(brandName ?? "campaign").replace(/\s+/g, "_")}_${channel.id}_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(result.payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${channel.id}_payload.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div
            className="text-tiny tracking-[0.28em] uppercase"
            style={{ color: ACCENT }}
          >
            DELIVERED · 出稿完成
          </div>
          <div className="font-semibold text-xl tracking-[-0.015em] mt-0.5">
            {channel.name} · {assetTitle}
          </div>
          <div className="text-tiny" style={{ color: "#888" }}>
            {result.provider} · {result.model}
          </div>
        </div>
        <div className="flex gap-2">
          {result.csvRows && (
            <button
              onClick={downloadCsv}
              className="px-4 py-2 text-tiny tracking-[0.18em] uppercase transition"
              style={{ background: ACCENT, color: "white" }}
            >
              ⬇ 下載 CSV
            </button>
          )}
          {result.payload && (
            <button
              onClick={downloadJson}
              className="px-4 py-2 text-tiny tracking-[0.18em] uppercase transition"
              style={{ border: `1px solid ${HAIR}`, color: "#666" }}
            >
              ⬇ JSON
            </button>
          )}
          <button
            onClick={onReset}
            className="px-4 py-2 text-tiny tracking-[0.18em] uppercase transition"
            style={{ border: `1px solid ${HAIR}`, color: "#666" }}
          >
            重來
          </button>
        </div>
      </div>

      {/* Channel-specific renderers */}
      {channel.id === "meta-ads" && result.payload?.variants && (
        <MetaAdsPreview payload={result.payload} channel={channel} />
      )}
      {channel.id === "ig-schedule" && result.payload?.schedule && (
        <IgSchedulePreview payload={result.payload} />
      )}
      {!["meta-ads", "ig-schedule"].includes(channel.id) && (
        <pre
          className="whitespace-pre-wrap text-small leading-relaxed font-sans p-4"
          style={{ border: `1px solid ${HAIR}`, background: "#FAFAFA" }}
        >
          {JSON.stringify(result.payload, null, 2)}
        </pre>
      )}

      {/* Fallback raw text */}
      {!result.payload && (
        <pre
          className="whitespace-pre-wrap text-small leading-relaxed font-sans p-4"
          style={{ border: `1px solid ${HAIR}` }}
        >
          {result.rawText}
        </pre>
      )}
    </div>
  );
}

function MetaAdsPreview({ payload, channel }: { payload: any; channel: Channel }) {
  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {payload.variants.map((v: any, i: number) => (
          <article
            key={i}
            className="overflow-hidden"
            style={{ border: `1px solid ${HAIR}` }}
          >
            <div
              className="px-3 py-2 flex items-center justify-between"
              style={{ background: channel.color, color: "white" }}
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-small">
                  {channel.logo}
                </span>
                <span className="text-tiny tracking-[0.18em] uppercase opacity-90">
                  Variant {i + 1}
                </span>
              </div>
              <span className="text-tiny opacity-80">{v.angle}</span>
            </div>
            <div className="p-4 bg-white">
              <div
                className="text-small leading-relaxed mb-3"
                style={{ color: INK }}
              >
                {v.primary_text}
              </div>
              <div className="aspect-[1.91/1] bg-[#F5F5F5] flex items-center justify-center text-tiny" style={{ color: "#999" }}>
                [creative 預覽 · 1.91:1]
              </div>
              <div className="mt-3 flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="font-medium text-small tracking-[-0.005em]">
                    {v.headline}
                  </div>
                  <div className="text-tiny" style={{ color: "#888" }}>
                    {v.description}
                  </div>
                </div>
                <button
                  className="shrink-0 px-3 py-1.5 text-tiny tracking-[0.16em] uppercase"
                  style={{ background: INK, color: "white" }}
                  disabled
                >
                  {v.cta ?? "Learn More"}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {payload.audience_suggestion && (
        <div className="mt-5 p-4" style={{ border: `1px solid ${HAIR}` }}>
          <div
            className="text-tiny tracking-[0.22em] uppercase"
            style={{ color: ACCENT }}
          >
            建議受眾
          </div>
          <div className="mt-2 text-small">
            <div>
              <b>年齡：</b> {payload.audience_suggestion.age}
            </div>
            {payload.audience_suggestion.interests && (
              <div className="mt-1">
                <b>興趣：</b>{" "}
                {payload.audience_suggestion.interests.join("、")}
              </div>
            )}
            {payload.audience_suggestion.behaviors && (
              <div className="mt-1">
                <b>行為：</b>{" "}
                {payload.audience_suggestion.behaviors.join("、")}
              </div>
            )}
          </div>
        </div>
      )}

      {Array.isArray(payload.placement) && (
        <div className="mt-3 flex gap-2 flex-wrap">
          {payload.placement.map((p: string) => (
            <span
              key={p}
              className="text-tiny px-2 py-0.5"
              style={{ border: `1px solid ${HAIR}`, color: "#666" }}
            >
              {p}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function IgSchedulePreview({ payload }: { payload: any }) {
  return (
    <div className="space-y-2 max-h-[640px] overflow-y-auto pr-2">
      {payload.schedule.map((s: any, i: number) => (
        <article
          key={i}
          className="p-3 flex items-start gap-3"
          style={{ border: `1px solid ${HAIR}` }}
        >
          <div
            className="w-12 h-12 flex flex-col items-center justify-center shrink-0"
            style={{ background: "#FAFAFA" }}
          >
            <div
              className="text-tiny tracking-[0.18em] uppercase"
              style={{ color: "#888" }}
            >
              DAY
            </div>
            <div className="font-semibold text-medium leading-none">
              {s.day}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="text-tiny tracking-[0.18em] uppercase px-1.5 py-0.5"
                style={{ background: "#E1306C", color: "white" }}
              >
                {s.type}
              </span>
              <span className="font-medium text-small">{s.hook}</span>
            </div>
            <div className="mt-1 text-small" style={{ color: "#444" }}>
              {s.caption}
            </div>
            {Array.isArray(s.hashtags) && (
              <div
                className="mt-1 text-tiny"
                style={{ color: ACCENT }}
              >
                {s.hashtags.join(" ")}
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
