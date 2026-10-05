/**
 * MyTaskCardsPage — 「我的任務卡」：跨通路的任務卡總覽與管理。
 *
 * 2026-10-04（CJ「在所有的任務卡中，我也想加入它可以管理任務卡，可以在不同的平台中，
 * 管理到自己常用的，或進行修改」）。
 *
 * 分工：各通路頁負責「用」——卡片上按星號就加進常用；這一頁負責「管」——一次看完
 * 七個通路各擺了哪幾張、自己建的卡在哪、哪張還沒上架，並在這裡改名、編輯、複製到
 * 別的通路、上下架、刪除。
 *
 * 只列兩種卡：常用清單裡的（不管是內建還是自建）＋這個品牌自己建的（不管有沒有加常用、
 * 有沒有上架）。沒加常用的內建卡不列——那是各通路頁「看全部」的工作，搬過來這一頁就
 * 變成第二個目錄。
 *
 * 內建卡不能在這裡改內容：它的寫法是共用的，改了會動到所有品牌。要自己的版本，
 * 走自建卡（貼範例反推）。
 */
import React, { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import type { ShellOutletCtx } from "../../platform/lib/shellContext";
import { showToastGlobal } from "../../platform/components/Toast";
import { toastWithUpgrade } from "../../platform/lib/upgradeToast";
import { IllustratedEmpty } from "../../platform/components/EmptyIllustration";
import { AddIcon, CopyIcon, DeleteIcon, EditIcon, FavoriteIcon } from "../../platform/components/icons";
import { isFrontVisibleCard } from "../../platform/lib/sourceVocabulary";
import TaskCardComposer, { type ComposerChannel } from "../../strategy/components/taskCard/TaskCardComposer";
import { ROUTE_TO_PLATFORM, PLATFORM_META, isComposerChannel, customPlatformMeta, type FBTaskCard } from "./platformTask/taskModel";
import { useCustomChannels } from "../lib/customChannels";
import { resolveTrayIds, toggleTrayId, taskPlatformOf, isDefaultTray, type TrayData } from "../lib/taskTrayClient";
import { buildMyCardRows, type MyCardRow, type OwnCardLite } from "../lib/myTaskCards";

/** 這一頁列哪些通路、照什麼順序：內容層的七個發文通路。 */
const CHANNEL_ROUTES = ["fb", "ig", "threads", "line", "tt", "email", "web"] as const;

export default function MyTaskCardsPage() {
  const { lang } = useLang();
  const en = lang === "en";
  const navigate = useNavigate();
  const ctx = useOutletContext<ShellOutletCtx>();
  const brandId = ctx?.brandId ?? null;
  const brandName = (ctx?.brands ?? []).find((b: any) => b.id === brandId)?.name ?? null;

  // 2026-10-04：用戶自己加的通路（蝦皮、momo…）接在七個內建通路後面；路由片段就是它的 id。
  const { channels: customChannels } = useCustomChannels(brandId);
  const channels = useMemo(
    () => [
      ...CHANNEL_ROUTES.map((route) => ({ route: route as string, platform: ROUTE_TO_PLATFORM[route]! })),
      ...customChannels.map((c) => ({ route: c.id, platform: c.id })),
    ],
    [customChannels],
  );
  const isListingChannel = (platform: string) => customChannels.find((c) => c.id === platform)?.format === "listing";
  const metaOf = (platform: string) =>
    PLATFORM_META[platform] ?? customPlatformMeta(customChannels.find((c) => c.id === platform)?.name ?? platform);
  const platforms = useMemo(() => channels.map((c) => c.platform), [channels]);

  const listQ = trpc.quickTask.listFB.useQuery(
    { brandId: brandId ?? undefined, brandName: brandName ?? undefined } as any,
    { enabled: !!brandId, refetchOnWindowFocus: false, retry: 2 },
  );
  const traysQ = (trpc as any).quickTask.trays.useQuery(
    { brandId: brandId ?? 0, platforms },
    { enabled: !!brandId, refetchOnWindowFocus: false },
  );
  const ownQ = (trpc as any).brandTaskCard.list.useQuery(
    { brandId: brandId ?? 0 },
    { enabled: !!brandId, refetchOnWindowFocus: false },
  );
  const refetchAll = () => { void listQ.refetch(); void traysQ.refetch(); void ownQ.refetch(); };

  const onErr = (e: any) => toastWithUpgrade(e?.message ?? (en ? "Something went wrong" : "操作失敗"), en);
  const setTrayMut = (trpc as any).quickTask.setTray.useMutation({ onSuccess: () => traysQ.refetch(), onError: onErr });
  const renameMut = (trpc as any).brandTaskCard.update.useMutation({ onSuccess: refetchAll, onError: onErr });
  const duplicateMut = (trpc as any).brandTaskCard.duplicate.useMutation({
    onSuccess: () => { refetchAll(); showToastGlobal(en ? "Card copied." : "已複製一張。"); },
    onError: onErr,
  });
  const publishMut = (trpc as any).brandTaskCard.publish.useMutation({ onSuccess: refetchAll, onError: onErr });
  const unpublishMut = (trpc as any).brandTaskCard.unpublish.useMutation({ onSuccess: refetchAll, onError: onErr });
  const removeMut = (trpc as any).brandTaskCard.remove.useMutation({ onSuccess: refetchAll, onError: onErr });

  const [filter, setFilter] = useState<string>("all");
  const [composer, setComposer] = useState<{ channel: string; cardId: string | null } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [copying, setCopying] = useState<string | null>(null);      // 正在選「複製到哪個通路」的卡
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const shown: FBTaskCard[] = useMemo(
    () => ((listQ.data as any[]) ?? []).filter(isFrontVisibleCard) as FBTaskCard[],
    [listQ.data],
  );
  const ownCards: OwnCardLite[] = (ownQ.data as OwnCardLite[]) ?? [];
  const maxTray: number = traysQ.data?.maxTray ?? 12;

  /** 每個通路：看得到的卡、常用 id、要列出來的列。 */
  const sections = useMemo(() => channels.map(({ route, platform }) => {
    const tasks = shown.filter((t) => taskPlatformOf(t) === platform);
    const raw = traysQ.data?.byPlatform?.[platform];
    const tray: TrayData | null = raw ? { ...raw, maxTray } : null;
    const trayIds = resolveTrayIds(tray, tasks);
    const rows = buildMyCardRows({ tasks, trayIds, ownCards: ownCards.filter((c) => c.channel === platform), en });
    return { route, platform, tasks, trayIds, rows, isDefault: isDefaultTray(tray, tasks) };
  }), [channels, shown, traysQ.data, ownCards, en, maxTray]);

  const visibleSections = sections.filter((s) => filter === "all" || s.platform === filter);
  const loading = !!brandId && (listQ.isLoading || traysQ.isLoading || ownQ.isLoading);
  const totalRows = sections.reduce((n, s) => n + s.rows.length, 0);

  const toggleFav = (platform: string, trayIds: string[], id: string) => {
    if (!brandId) return;
    const r = toggleTrayId(trayIds, id, maxTray);
    if (!r.ok) {
      showToastGlobal(r.reason === "full"
        ? (en ? `Up to ${maxTray} saved cards per channel.` : `每個通路最多 ${maxTray} 張常用卡，先拿掉一張再加。`)
        : (en ? "Keep at least one saved card." : "常用清單至少留一張。"));
      return;
    }
    setTrayMut.mutate({ brandId, platform, taskIds: r.next });
  };

  if (!brandId) {
    return (
      <div className="max-w-[1100px] mx-auto px-6 py-16">
        <IllustratedEmpty kind="cards" title={en ? "Pick a brand first" : "先選一個品牌"} />
      </div>
    );
  }

  const btn = "inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[12px] font-medium text-neutral-700 hover:border-neutral-400 disabled:opacity-50";

  return (
    <div className="max-w-[1100px] mx-auto px-6 pt-10 pb-24">
      <h1 className="text-[26px] font-bold text-neutral-900">{en ? "My task cards" : "我的任務卡"}</h1>

      {/* 通路篩選 */}
      <div className="mt-5 flex flex-wrap gap-2">
        {[{ platform: "all", label: en ? "All" : "全部", n: totalRows },
          ...sections.map((s) => ({ platform: s.platform, label: en ? metaOf(s.platform).label : metaOf(s.platform).labelZh, n: s.rows.length }))]
          .map((c) => (
            <button
              key={c.platform}
              onClick={() => setFilter(c.platform)}
              className={`rounded-full border px-3 py-1 text-[13px] font-medium tabular-nums ${filter === c.platform ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400"}`}
            >
              {c.label} {c.n}
            </button>
          ))}
      </div>

      {loading ? (
        <p className="mt-10 text-[14px] text-neutral-400">{en ? "Loading…" : "載入中…"}</p>
      ) : (
        <div className="mt-8 flex flex-col gap-8">
          {visibleSections.map((s) => {
            const meta = metaOf(s.platform);
            const canCompose = isComposerChannel(s.platform);
            return (
              <section key={s.platform}>
                <div className="flex items-center gap-2">
                  {meta && (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: meta.bg }}>
                      <FontAwesomeIcon icon={meta.icon} className="text-white" style={{ fontSize: 12 }} />
                    </span>
                  )}
                  <h2 className="text-[16px] font-semibold text-neutral-900">{en ? meta?.label : meta?.labelZh}</h2>
                  <span className="text-[12px] tabular-nums text-neutral-500" title={en ? "Saved / all cards in this channel" : "常用 / 這個通路全部"}>
                    {s.trayIds.length} / {s.tasks.length}
                    {s.isDefault && s.trayIds.length > 0 ? (en ? " · default set" : "・系統預設") : ""}
                  </span>
                  <span className="flex-1" />
                  {canCompose && (
                    <button className={btn} onClick={() => setComposer({ channel: s.platform, cardId: null })}>
                      <AddIcon size={11} /> {en ? "New card" : "新增任務卡"}
                    </button>
                  )}
                  <button className={btn} onClick={() => navigate(`/tasks/${s.route}`)}>
                    {en ? "Open channel" : "到這個通路"}
                  </button>
                </div>

                {s.rows.length === 0 ? (
                  <p className="mt-3 rounded-lg border border-dashed border-neutral-200 px-4 py-5 text-[13px] text-neutral-500">
                    {en ? "No cards here yet." : "這個通路還沒有任務卡。"}
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
                    {s.rows.map((row: MyCardRow) => {
                      const busy = renameMut.isPending || duplicateMut.isPending || removeMut.isPending;
                      return (
                        <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                          {/* 星號：還沒上架的自建卡不能加常用（任務頁本來就不列它）。 */}
                          <button
                            disabled={!row.runnable || setTrayMut.isPending}
                            onClick={() => toggleFav(s.platform, s.trayIds, row.id)}
                            title={!row.runnable ? (en ? "Publish it first" : "上架後才能加入常用")
                              : row.favorite ? (en ? "Remove from saved" : "從常用移除") : (en ? "Add to saved" : "加入常用")}
                            aria-pressed={row.favorite}
                            className={`flex h-7 w-7 items-center justify-center rounded-full disabled:cursor-not-allowed ${row.favorite ? "text-neutral-900" : "text-neutral-300 hover:text-neutral-600"}`}
                          >
                            <FavoriteIcon size={13} />
                          </button>

                          <div className="min-w-[180px] flex-1">
                            {renaming?.id === row.id ? (
                              <form
                                className="flex items-center gap-2"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  const name = renaming.value.trim();
                                  if (name && name !== row.name) renameMut.mutate({ brandId, cardId: row.id, name });
                                  setRenaming(null);
                                }}
                              >
                                <input
                                  autoFocus
                                  value={renaming.value}
                                  maxLength={60}
                                  onChange={(e) => setRenaming({ id: row.id, value: e.target.value })}
                                  onBlur={() => setRenaming(null)}
                                  className="w-full max-w-[320px] rounded-md border border-neutral-300 px-2 py-1 text-[14px]"
                                />
                              </form>
                            ) : (
                              <p className="text-[14px] font-medium text-neutral-900">{row.name}</p>
                            )}
                            <p className="mt-0.5 text-[12px] text-neutral-500">
                              {row.kindLabel}
                              {row.statusLabel ? `・${row.statusLabel}` : ""}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {row.runnable && (
                              <button className={btn} onClick={() => navigate(`/tasks/${s.route}?task=${encodeURIComponent(row.id)}`)}>
                                {en ? "Write" : "開始寫"}
                              </button>
                            )}
                            {row.own && (
                              <>
                                <button className={btn} disabled={busy} onClick={() => setRenaming({ id: row.id, value: row.name })}>
                                  {en ? "Rename" : "改名"}
                                </button>
                                <button className={btn} onClick={() => setComposer({ channel: s.platform, cardId: row.id })}>
                                  <EditIcon size={11} /> {en ? "Edit SKILL" : "編輯 SKILL"}
                                </button>
                                <button className={btn} disabled={busy} onClick={() => setCopying(copying === row.id ? null : row.id)}>
                                  <CopyIcon size={11} /> {en ? "Copy to…" : "複製到…"}
                                </button>
                                {row.status === "ready" ? (
                                  <button className={btn} disabled={unpublishMut.isPending} onClick={() => unpublishMut.mutate({ brandId, cardId: row.id })}>
                                    {en ? "Unpublish" : "下架"}
                                  </button>
                                ) : row.canPublish ? (
                                  <button className={btn} disabled={publishMut.isPending} onClick={() => publishMut.mutate({ brandId, cardId: row.id })}>
                                    {en ? "Publish" : "上架"}
                                  </button>
                                ) : null}
                                {confirmDelete === row.id ? (
                                  <>
                                    <button
                                      className={`${btn} border-neutral-900 bg-neutral-900 text-white hover:border-neutral-900`}
                                      disabled={removeMut.isPending}
                                      onClick={() => { removeMut.mutate({ brandId, cardId: row.id }); setConfirmDelete(null); }}
                                    >
                                      {en ? "Delete for good" : "確定刪除"}
                                    </button>
                                    <button className={btn} onClick={() => setConfirmDelete(null)}>{en ? "Cancel" : "取消"}</button>
                                  </>
                                ) : (
                                  <button className={btn} onClick={() => setConfirmDelete(row.id)} aria-label={en ? "Delete" : "刪除"}>
                                    <DeleteIcon size={11} />
                                  </button>
                                )}
                              </>
                            )}
                          </div>

                          {/* 複製到哪個通路——選了就複製，同通路會加「（副本）」。 */}
                          {copying === row.id && (
                            <div className="flex w-full flex-wrap items-center gap-1.5 pl-10">
                              <span className="text-[12px] text-neutral-500">{en ? "Copy to:" : "複製到："}</span>
                              {/* 商品頁的卡（逐欄 SKILL）與貼文卡不能互相複製，server 也會擋；這裡只列同型態的通路。 */}
                              {channels.filter((c) => isComposerChannel(c.platform) && isListingChannel(c.platform) === isListingChannel(s.platform)).map((c) => (
                                <button
                                  key={c.platform}
                                  className={btn}
                                  disabled={duplicateMut.isPending}
                                  onClick={() => { duplicateMut.mutate({ brandId, cardId: row.id, channel: c.platform }); setCopying(null); }}
                                >
                                  {en ? metaOf(c.platform).label : metaOf(c.platform).labelZh}
                                  {c.platform === s.platform ? (en ? " (same)" : "（同通路）") : ""}
                                </button>
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {composer && (
        <TaskCardComposer
          isOpen
          onClose={() => { setComposer(null); refetchAll(); }}
          brandId={brandId}
          channel={composer.channel as ComposerChannel}
          channelLabel={(en ? metaOf(composer.channel).label : metaOf(composer.channel).labelZh) ?? composer.channel}
          format={customChannels.find((c) => c.id === composer.channel)?.format === "listing" ? "listing" : "post"}
          initialCardId={composer.cardId}
          onPublished={refetchAll}
        />
      )}
    </div>
  );
}
