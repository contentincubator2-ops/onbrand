/**
 * CampaignTrayPage — 內容層的「活動」：把策略層排好的企劃，一天一天寫出來。
 *
 * 2026-09-25（CJ「在內容層增加活動的 mission tray」）
 * 2026-09-26（CJ「點進去，會展開該活動的時間與發佈平台的圖，每天的內容點進去，
 * 可以跳出視窗，看到預計要發布的內容」＋「保持 notion style 一致性」）
 *
 * 活動本來就是一張時間表。第一版畫成卡片牆，時間維度整個消失——使用者得自己從
 * 八張卡的角標上把日期拼回來。現在是日曆：哪幾天有東西、分在哪些平台是一眼的事，
 * 細節收在點擊之後。
 *
 * 三層資訊，一層只做一件事：
 *   1. 沒帶活動 → 哪幾檔活動、進度多少
 *   2. 帶了活動 → 日曆：每一天有什麼平台要發（寫完的打勾）
 *   3. 點某一天 → 視窗：那天要發的內容（用跟其他任務頁同一個卡殼）
 *
 * 設計系統（project_design_system）：平台不用品牌色區分——那會讓一個畫面同時出現
 * 五六個 accent，而顏色在這裡不傳達狀態，只是分類，分類用圖示就夠了。顏色只留給
 * 狀態（success＝已寫）與下一步動作（primary）。沒有 hex、沒有 shadow、border
 * 一律 border-divider。
 *
 * 讀的是同一筆 campaignPlan（策略層改了切角，這裡下一次進來就是新的）；這一頁
 * 沒有「要不要做這篇」的決策，那是策略層的事。
 *
 * 2026-09-30（CJ「都定稿以後，再到內容層寫內容…決定哪些行動方案，例如某一天的貼文，
 * 要排程到本周企畫的行事曆上」）：
 *   · 只有定稿的企劃會出現在這裡（trayList 已經擋）；直接開一份還沒定稿的，請他回策略層。
 *   · 點某一天打開的視窗裡，每一篇下面有「排進本週企劃」——預設是排進去的，關掉那篇
 *     就不會出現在本週企劃（campaign.setInPlanner）。
 */
import { IllustratedEmpty } from "../../platform/components/EmptyIllustration";
import React from "react";
import { useNavigate, useSearchParams, useOutletContext } from "react-router-dom";
import {
  Button, Card, CardBody, Chip, Modal, ModalContent, ModalHeader, ModalBody, Progress, Spinner, Switch, Tooltip,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faPenNib, faCalendarDays, faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import type { ShellOutletCtx } from "../../app/shell/ShellLayout";
import { TaskCardShell, TaskCardAvatar } from "../components/TaskCardShell";
import { phaseOf } from "../../strategy/lib/campaignSchema";
import { weeksFor } from "../lib/campaignCalendar";
import { CHANNEL_META, channelLabel, channelRoute } from "../lib/channelMeta";
import { HelpTip } from "../../platform/components/HelpTip";

const ymd = (d: Date) => d.toISOString().slice(0, 10);

const dicebear = (seed: string) =>
  `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent`;

export default function CampaignTrayPage() {
  const { lang } = useLang();
  const en = lang === "en";
  const L = (zh: string, e: string) => (en ? e : zh);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const ctx = useOutletContext<ShellOutletCtx>();

  const brandId = Number(searchParams.get("b") ?? ctx?.scope?.brandId ?? 0) || null;
  const eventId = Number(searchParams.get("e") ?? 0) || null;
  const startFlag = searchParams.get("start") === "1";
  const wantItem = searchParams.get("item");

  const [openDay, setOpenDay] = React.useState<string | null>(null);

  const listQ = (trpc as any).campaign.trayList.useQuery(
    { brandId: brandId ?? 0 }, { enabled: !!brandId && !eventId, refetchOnWindowFocus: false },
  );
  const oneQ = (trpc as any).campaign.get.useQuery(
    { eventId: eventId ?? 0 }, { enabled: !!eventId, refetchOnWindowFocus: false },
  );
  const utils = (trpc as any).useUtils();
  const inPlannerMut = (trpc as any).campaign.setInPlanner.useMutation({
    onSuccess: () => {
      utils?.campaign?.get?.invalidate?.({ eventId: eventId ?? 0 });
      utils?.planner?.invalidate?.();
    },
  });

  const openItem = React.useCallback((item: any) => {
    const sp = new URLSearchParams();
    sp.set("task", item.taskId);
    sp.set("camp", String(eventId ?? ""));
    sp.set("item", item.id);
    if (item.angle) sp.set("topic", item.angle);
    navigate(`/tasks/${channelRoute(item.platform)}?${sp.toString()}`);
  }, [eventId, navigate]);

  // ?start=1 / ?item= 的自動開卡：交棒要一路到底，不是把人丟在日曆前面再找一次。
  const firedRef = React.useRef(false);
  React.useEffect(() => {
    if (firedRef.current || !oneQ.data?.plan?.items?.length || !oneQ.data.plan.lockedAt) return;
    const items = oneQ.data.plan.items.filter((i: any) => i.enabled);
    const target = wantItem
      ? items.find((i: any) => i.id === wantItem)
      : startFlag ? items.find((i: any) => !i.outputId) : null;
    if (!target) return;
    firedRef.current = true;
    openItem(target);
  }, [oneQ.data, wantItem, startFlag, openItem]);

  // ── 層一：這個品牌有企劃的活動 ──
  if (!eventId) {
    const rows: any[] = (listQ.data as any[]) ?? [];
    const live = rows.filter((r) => !r.ended);
    const ended = rows.filter((r) => r.ended);
    return (
      <main className="px-8 py-10">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
            {L("活動", "Campaigns")}
            <HelpTip>{L("要改企劃本身（節奏、切角、用哪張卡），回策略層的活動頁。",
               "To change the plan itself (cadence, angles, cards), go back to the campaign page in Strategy.")}</HelpTip>
          </h1>
        </header>

        {listQ.isLoading && (
          <div className="flex items-center gap-3 py-6">
            <Spinner size="sm" /><span className="text-small text-default-500">{L("載入中…", "Loading…")}</span>
          </div>
        )}
        {listQ.error && <p className="text-small text-danger">{String(listQ.error?.message ?? "").slice(0, 200)}</p>}

        {!listQ.isLoading && !listQ.error && rows.length === 0 && (
          <IllustratedEmpty
            kind="event"
            title={L("這季還沒排上任何檔期", "Nothing on this season's schedule yet")}
            action={{
              label: L("去建立活動企劃", "Go set up a campaign"),
              onPress: () => navigate(`/brands/edit?cat=events${brandId ? `&b=${brandId}` : ""}`),
            }}
          />
        )}

        {[["進行中", "Active", live], ["已結束", "Ended", ended]].map(([zh, e2, list]: any) => (
          (list as any[]).length > 0 && (
            <section key={zh} className="mt-8">
              <p className="text-tiny text-default-500 uppercase tracking-wider mb-3">{L(zh, e2)}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {(list as any[]).map((r) => (
                  <Card key={r.id} shadow="none" radius="md" isPressable
                    className="border border-divider hover:bg-default-50 transition"
                    onPress={() => navigate(`/campaigns?b=${brandId}&e=${r.id}`)}>
                    <CardBody className="gap-3 p-5">
                      <h3 className="text-medium font-semibold leading-snug">{r.name}</h3>
                      <p className="text-tiny text-default-500">
                        {r.startAt ? `${r.startAt} → ${r.endAt ?? "?"}` : L("未設定期間", "No dates")}
                      </p>
                      <Progress size="sm" color="default" aria-label={L("進度", "Progress")}
                        value={r.total ? (r.done / r.total) * 100 : 0} />
                      <p className="text-tiny text-default-500">{`${r.done}/${r.total} ${L("已寫", "written")}`}</p>
                    </CardBody>
                  </Card>
                ))}
              </div>
            </section>
          )
        ))}
      </main>
    );
  }

  // ── 層二：檔期日曆 ──
  const plan = oneQ.data?.plan;
  const ev = oneQ.data?.event;
  const items: any[] = (plan?.items ?? []).filter((i: any) => i.enabled);
  const done = items.filter((i) => !!i.outputId).length;
  const byDay = new Map<string, any[]>();
  for (const i of items) byDay.set(i.date, [...(byDay.get(i.date) ?? []), i]);
  const weeks = weeksFor(items.map((i) => i.date));
  const today = ymd(new Date());
  const dayItems = openDay ? (byDay.get(openDay) ?? []) : [];
  const WEEKDAYS = en ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["一", "二", "三", "四", "五", "六", "日"];
  const next = items.find((i) => !i.outputId);

  return (
    <main className="px-8 py-10">
      <Button size="sm" variant="light" className="mb-3 -ml-2"
        startContent={<FontAwesomeIcon icon={faChevronLeft} className="text-tiny" />}
        onPress={() => navigate(`/campaigns${brandId ? `?b=${brandId}` : ""}`)}>
        {L("所有活動", "All campaigns")}
      </Button>

      {oneQ.isLoading && (
        <div className="flex items-center gap-3 py-6">
          <Spinner size="sm" /><span className="text-small text-default-500">{L("載入中…", "Loading…")}</span>
        </div>
      )}
      {oneQ.error && <p className="text-small text-danger">{String(oneQ.error?.message ?? "").slice(0, 200)}</p>}

      {ev && (
        <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{ev.name}</h1>
            <p className="text-tiny text-default-500 mt-2">
              {plan?.smp ? `${plan.smp}　·　` : ""}
              {`${done}/${items.length} ${L("已寫", "written")}`}
              {ev.startAt ? `　·　${ev.startAt} → ${ev.endAt ?? "?"}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {next && plan?.lockedAt && (
              <Button size="sm" color="primary" radius="md" onPress={() => openItem(next)}>
                {L("寫下一篇", "Write next")}
              </Button>
            )}
            <Button size="sm" variant="bordered" radius="md"
              onPress={() => navigate(`/brands/edit?cat=campaign&e=${eventId}${brandId ? `&b=${brandId}` : ""}`)}>
              {L("回企劃調整", "Edit the plan")}
            </Button>
          </div>
        </header>
      )}

      {plan && !plan.lockedAt && (
        <Card shadow="none" className="border-2 border-dashed border-divider">
          <CardBody className="py-14 items-center text-center gap-3">
            <FontAwesomeIcon icon={faCalendarDays} className="text-4xl text-default-300" />
            <p className="text-medium font-medium">{L("這份企劃還沒定稿", "This plan isn't locked yet")}</p>
            <p className="text-small text-default-500">{L("策略層定稿之後，才會在這裡一篇一篇寫。", "Lock it in Strategy first, then write it here.")}</p>
            <Button size="sm" color="primary" radius="md"
              onPress={() => navigate(`/brands/edit?cat=campaign&e=${eventId}${brandId ? `&b=${brandId}` : ""}`)}>
              {L("回策略層定稿", "Go lock the plan")}
            </Button>
          </CardBody>
        </Card>
      )}

      {plan?.lockedAt && items.length === 0 && (
        <Card shadow="none" className="border-2 border-dashed border-divider">
          <CardBody className="py-16 items-center text-center gap-3">
            <FontAwesomeIcon icon={faCalendarDays} className="text-4xl text-default-300" />
            <p className="text-medium font-medium">{L("這檔活動沒有啟用中的項目", "Nothing switched on in this plan")}</p>
            <p className="text-small text-default-500">{L("回企劃頁把要寫的放回來。", "Put some rows back in the plan page.")}</p>
          </CardBody>
        </Card>
      )}

      {plan?.lockedAt && weeks.length > 0 && (
        <Card shadow="none" radius="md" className="border border-divider overflow-hidden">
          <div className="grid grid-cols-7 bg-default-50">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-tiny text-default-500 text-center py-1.5 font-medium">{d}</div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-t border-divider">
              {week.map((day) => {
                const list = byDay.get(day) ?? [];
                const allDone = list.length > 0 && list.every((i) => !!i.outputId);
                const isToday = day === today;
                const has = list.length > 0;
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => has && setOpenDay(day)}
                    disabled={!has}
                    aria-label={`${day}${has ? `｜${list.length}` : ""}`}
                    className={`min-h-[88px] text-left p-2 border-l border-divider flex flex-col gap-1.5 transition ${
                      has ? "bg-content1 hover:bg-default-50 cursor-pointer" : "bg-default-50/40 cursor-default"}`}
                  >
                    <span className={`text-tiny tabular-nums ${isToday
                      ? "bg-foreground text-background rounded-full px-1.5 py-0.5 self-start font-semibold"
                      : has ? "text-default-700" : "text-default-300"}`}>
                      {Number(day.slice(8))}
                    </span>
                    {has && (
                      <>
                        <span className="flex items-center gap-1.5 flex-wrap">
                          {list.map((i) => (
                            <FontAwesomeIcon
                              key={i.id}
                              icon={CHANNEL_META[i.platform]?.icon ?? faPenNib}
                              className={`text-tiny ${i.outputId ? "text-default-300" : "text-default-500"}`}
                            />
                          ))}
                          {allDone && <FontAwesomeIcon icon={faCheck} className="text-tiny text-success" />}
                        </span>
                        <span className="text-tiny text-default-500 leading-tight line-clamp-2">{list[0]!.angle}</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </Card>
      )}

      {/* 某一天的內容：一天通常一到兩則，用跟其他任務頁同一個卡殼 */}
      <Modal isOpen={!!openDay} onClose={() => setOpenDay(null)} size="2xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <span className="text-medium font-semibold">
              {openDay?.replace(/^\d{4}-/, "").replace("-", " / ")}
              <span className="text-tiny text-default-500 font-normal">
                {"　"}{L(`預計發布 ${dayItems.length} 則`, `${dayItems.length} scheduled`)}
              </span>
            </span>
            <span className="text-tiny text-default-500 font-normal">{ev?.name}</span>
          </ModalHeader>
          <ModalBody className="pb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {dayItems.map((i) => {
                const ph = phaseOf(i.phase);
                const written = !!i.outputId;
                return (
                  <div key={i.id} className="flex flex-col gap-2">
                  <TaskCardShell
                    onClick={() => (written ? navigate(`/run/${i.outputId}`) : openItem(i))}
                    ariaLabel={i.angle}
                    media={<>
                      <TaskCardAvatar src={dicebear(i.taskId)} />
                      <span className="absolute top-2 right-2">
                        <Chip size="sm" variant="flat" color={written ? "success" : "default"}
                          startContent={written ? <FontAwesomeIcon icon={faCheck} className="text-tiny ml-1" /> : undefined}>
                          {written ? L("已寫", "done") : (ph ? (en ? ph.en : ph.zh) : "")}
                        </Chip>
                      </span>
                      <Tooltip content={channelLabel(i.platform, en)} placement="top">
                        <span className="absolute top-2 left-2 w-6 h-6 rounded-full bg-content1 border border-divider flex items-center justify-center">
                          <FontAwesomeIcon icon={CHANNEL_META[i.platform]?.icon ?? faPenNib} className="text-tiny text-default-500" />
                        </span>
                      </Tooltip>
                    </>}
                  >
                    {/* 主角是「這則要發什麼」；用哪張卡是實作細節，降成 meta */}
                    <p className="text-small font-semibold leading-snug line-clamp-3">{i.angle}</p>
                    <p className="text-tiny text-default-500 line-clamp-1">{i.taskLabel}</p>
                    <div className="mt-auto pt-2 flex items-center gap-2 border-t border-divider">
                      <span className="text-tiny font-medium text-default-700 truncate">
                        {written ? L("看產出 →", "View output →") : L("開始寫 →", "Write it →")}
                      </span>
                    </div>
                  </TaskCardShell>
                  <Switch size="sm" isSelected={i.inPlanner !== false} isDisabled={inPlannerMut.isPending}
                    onValueChange={(v) => inPlannerMut.mutate({ eventId, itemId: i.id, inPlanner: v })}>
                    <span className="text-tiny text-default-600">{L("排進本週企劃", "Add to this week's plan")}</span>
                  </Switch>
                  </div>
                );
              })}
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>
    </main>
  );
}
