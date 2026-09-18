/**
 * Content · channel task tray — OnBrand PlatformTaskPage look: hero with search,
 * market pills, task-card grid (one card per approved writing skill), input
 * modal, then /hub/run/:postId.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Avatar, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass, faPlus } from "@fortawesome/free-solid-svg-icons";
import { trpc } from "../../../../lib/trpc";
import { ErrorNote, Loading, cx } from "../../ui";
import { useHubLang, useT } from "../../lang";
import { tierAccent, tierLabel } from "../../../platform/lib/tierVocabulary";
import {
  CHANNEL_META,
  agentAvatar,
  agentFor,
  isChannel,
  skillDescription,
  type HubChannel,
} from "../../components/tasks-shared";

type MarketFilter = "all" | "TW" | "US";

export default function HubTasksPage() {
  const { channel } = useParams();
  const t = useT();
  const { lang } = useHubLang();
  const navigate = useNavigate();
  const content = trpc.hub.admin.content.useQuery(undefined, { staleTime: 30_000 });
  const reps = trpc.hub.admin.reps.useQuery(undefined, { staleTime: 60_000 });
  const strategy = trpc.hub.admin.strategy.useQuery(undefined, { staleTime: 60_000 });
  const generate = trpc.hub.rep.generate.useMutation();

  const [search, setSearch] = useState("");
  const [market, setMarket] = useState<MarketFilter>("all");
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [repId, setRepId] = useState<number | null>(null);
  const [solutionId, setSolutionId] = useState<number | null>(null);
  const [angle, setAngle] = useState("");

  const ch = isChannel(channel) ? channel : null;
  const meta = ch ? CHANNEL_META[ch] : null;

  const skills = useMemo(
    () => (content.data?.skills ?? []).filter((s) => ch && s.channels.includes(ch)),
    [content.data, ch],
  );
  const visible = skills.filter((s) => {
    if (market !== "all" && !s.markets.includes(market)) return false;
    const q = search.trim().toLowerCase();
    return !q || `${s.nameEn} ${s.nameZh} ${agentFor(s.slug).name}`.toLowerCase().includes(q);
  });
  const countFor = (m: MarketFilter) => skills.filter((s) => m === "all" || s.markets.includes(m)).length;

  const active = skills.find((s) => s.slug === activeSlug) ?? null;
  const eligibleReps = useMemo(
    () => (reps.data ?? []).filter((r) => active && active.markets.includes(r.market) && r.consented),
    [reps.data, active],
  );
  const rep = eligibleReps.find((r) => r.id === repId) ?? null;

  // Default rep when a card opens: Amy for Taiwan skills, Priya for US-only ones.
  useEffect(() => {
    if (!active || !eligibleReps.length) return;
    const seed = active.markets.includes("TW") && (market === "all" || market === "TW") ? "amy" : "priya";
    setRepId((eligibleReps.find((r) => r.avatarSeed === seed) ?? eligibleReps[0]).id);
    const firstFeatured = (strategy.data?.solutions ?? []).find((s) => s.featured) ?? strategy.data?.solutions[0];
    setSolutionId(firstFeatured?.id ?? null);
    setAngle("");
    generate.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlug, eligibleReps.length]);

  const pendingPack = (content.data?.packs ?? []).find((p) => p.market === rep?.market) ?? null;

  if (!ch || !meta) return <Navigate to="/hub/tasks/facebook" replace />;

  const solutions = [...(strategy.data?.solutions ?? [])].sort((a, b) => Number(b.featured) - Number(a.featured));
  const run = async () => {
    if (!active || !rep || !solutionId) return;
    try {
      const post = await generate.mutateAsync({
        repId: rep.id,
        solutionId,
        channel: ch as HubChannel,
        skillSlug: active.slug,
        angle: angle.trim() || undefined,
      });
      navigate(`/hub/run/${post.postId}`);
    } catch {
      /* error shown inline */
    }
  };

  const pills: Array<{ id: MarketFilter; label: string }> = [
    { id: "all", label: t("All", "全部") },
    { id: "TW", label: t("Taiwan", "台灣") },
    { id: "US", label: t("United States", "美國") },
  ];

  return (
    <div className="min-w-0 py-6">
      {/* Hero */}
      <div className="mx-auto max-w-3xl text-center">
        <div className="flex items-center justify-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full text-white" style={{ background: meta.color }}>
            <FontAwesomeIcon icon={meta.icon} />
          </span>
          <span className="text-[12px] font-semibold uppercase text-neutral-500" style={{ letterSpacing: "0.22em" }}>
            {t("Content", "內容")} · {meta.label}
          </span>
        </div>
        <h1 className="mt-3 font-semibold text-neutral-900" style={{ fontSize: "clamp(1.45rem,2.8vw,2rem)" }}>
          {t(`${meta.label} posts reps can publish today`, `業務今天就能發的 ${meta.label} 貼文`)}
        </h1>
        <p className="mt-2 text-[14px] text-neutral-500">
          {t(
            "One post at a time, in the brand voice, checked against the market's rules before it's shared.",
            "一次一篇，用品牌的語氣寫，分享前先通過該市場的法規檢查。",
          )}
        </p>
        <div className="relative mx-auto mt-5 max-w-xl">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Search writing skills…", "搜尋寫作技能…")}
            className="h-14 w-full rounded-[18px] border border-neutral-100 bg-white pl-12 pr-5 text-[15px] shadow-md outline-none focus:border-neutral-300"
          />
        </div>
      </div>

      {/* Market pills */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {pills.map((p) => {
          const on = market === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setMarket(p.id)}
              className={cx("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm", on ? "text-white" : "bg-white text-neutral-700")}
              style={on ? { background: "#171717" } : { border: "1px solid #E5E5E5" }}
            >
              {p.label}
              <span className={cx("rounded-full px-1.5 text-[12px]", on ? "bg-white/20" : "bg-neutral-100 text-neutral-500")}>{countFor(p.id)}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {content.isLoading ? (
          <Loading />
        ) : content.error ? (
          <ErrorNote error={content.error} />
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {visible.map((s) => {
              const agent = agentFor(s.slug);
              const approved = s.status === "approved";
              return (
                <button
                  key={s.slug}
                  type="button"
                  onClick={() => approved && setActiveSlug(s.slug)}
                  disabled={!approved}
                  className={cx(
                    "flex flex-col overflow-hidden rounded-2xl text-left transition",
                    approved ? "hover:scale-[1.02] hover:shadow-lg" : "cursor-not-allowed opacity-70",
                  )}
                  style={{ border: "1px solid rgba(0,0,0,0.07)", background: "white" }}
                >
                  <div className="relative flex items-center justify-center" style={{ height: 130, background: "#F5F4F2", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    <Avatar src={agentAvatar(agent.name)} name={agent.name} isBordered color="default" className="h-20 w-20 ring-2 ring-white/60" />
                    <span
                      className="absolute right-2 top-2 rounded-full px-2 py-0.5 font-bold text-white shadow-sm"
                      style={{ background: approved ? tierAccent("30s") : "#a3a3a3", fontSize: 12, letterSpacing: "0.06em" }}
                    >
                      {approved ? tierLabel("30s", lang) : t("Draft", "草稿")}
                    </span>
                    <div className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full" style={{ background: meta.color }}>
                      <FontAwesomeIcon icon={meta.icon} className="text-white" style={{ fontSize: 12 }} />
                    </div>
                    <span
                      className="absolute bottom-2 right-2 rounded-full px-1.5 py-0.5 text-[12px] font-semibold"
                      style={{ background: "rgba(0,0,0,0.55)", color: "#fff", letterSpacing: "0.03em" }}
                    >
                      {s.markets.join(" · ")}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5 p-3">
                    <div className="line-clamp-2 text-small font-semibold text-neutral-900">{t(s.nameEn, s.nameZh)}</div>
                    <div className="line-clamp-2 text-tiny text-default-500">{skillDescription(s.skillMd)}</div>
                    <div>
                      <span className="inline-flex rounded-full border px-2 py-0.5 text-[12px] text-neutral-600">
                        {approved
                          ? t(`Marketing-approved · v${s.version}`, `行銷部核准 · v${s.version}`)
                          : t("Waiting for approval", "待行銷核准")}
                      </span>
                    </div>
                    <div className="mt-auto flex items-center gap-2 border-t border-neutral-100 pt-2">
                      <Avatar src={agentAvatar(agent.name)} name={agent.name} className="h-5 w-5" />
                      <span className="truncate text-[12px] text-neutral-600">
                        {agent.name} · {t(agent.roleEn, agent.roleZh)}
                      </span>
                      <span className="ml-auto shrink-0 text-[11px] text-neutral-400">{t(`${s.uses} posts`, `${s.uses} 篇`)}</span>
                    </div>
                  </div>
                </button>
              );
            })}
            <Link
              to="/hub/content/skills"
              className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-white text-neutral-500 transition hover:border-neutral-500 hover:text-neutral-800"
            >
              <FontAwesomeIcon icon={faPlus} />
              <span className="text-[13px] font-medium">{t("Add a writing skill", "新增寫作技能")}</span>
            </Link>
          </div>
        )}
        {!content.isLoading && !visible.length ? (
          <p className="mt-6 text-center text-[13px] text-neutral-500">{t("No skills match this filter.", "沒有符合的寫作技能。")}</p>
        ) : null}
      </div>

      <Modal
        isOpen={!!active}
        onClose={() => !generate.isPending && setActiveSlug(null)}
        size="2xl"
        scrollBehavior="inside"
        backdrop="blur"
        classNames={{
          base: "max-h-[90vh]",
          body: "py-3 px-4",
          footer: "border-t border-default-100 bg-white py-2 px-4",
          header: "py-2 px-3 bg-white border-b border-default-100",
          closeButton: "text-default-400 hover:bg-default-100",
        }}
      >
        <ModalContent>
          {active ? (
            <>
              <ModalHeader className="flex items-center gap-2 border-b border-default-100 px-3 py-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full text-white" style={{ background: meta.color }}>
                  <FontAwesomeIcon icon={meta.icon} style={{ fontSize: 12 }} />
                </span>
                <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-default-800">
                  {t(active.nameEn, active.nameZh)}
                  <span className="ml-2 font-normal text-default-500">· {agentFor(active.slug).name}</span>
                </p>
                <span className="shrink-0 rounded-full px-2 py-0.5 text-[12px] font-bold text-white shadow-sm" style={{ background: tierAccent("30s") }}>
                  {tierLabel("30s", lang)}
                </span>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4 py-1">
                  <label className="block">
                    <span className="text-[12px] font-semibold text-neutral-700">{t("Write as", "以哪位業務的身分")}</span>
                    <select
                      value={repId ?? ""}
                      onChange={(e) => setRepId(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[14px]"
                    >
                      {eligibleReps.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} · {r.market} · {r.team}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[12px] font-semibold text-neutral-700">{t("Solution", "方案")}</span>
                    <select
                      value={solutionId ?? ""}
                      onChange={(e) => setSolutionId(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[14px]"
                    >
                      {solutions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {rep?.market === "TW" ? s.nameZh : s.nameEn}
                          {s.featured ? ` ★` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[12px] font-semibold text-neutral-700">{t("Angle (optional)", "想強調的重點（選填）")}</span>
                    <textarea
                      value={angle}
                      onChange={(e) => setAngle(e.target.value)}
                      rows={3}
                      placeholder={t("e.g. restaurant owners who re-type orders by hand", "例如：還在手抄訂單的餐飲店老闆")}
                      className="mt-1 w-full resize-y rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[14px]"
                    />
                  </label>
                  <p className="rounded-lg bg-neutral-50 px-3 py-2 text-[12px] leading-relaxed text-neutral-600">
                    {rep?.market === "US"
                      ? t(
                          "Follows the US FTC Endorsement Guides pack, marketing's wording lists and approved prices, and ends with the rep's tracked link.",
                          "遵循美國 FTC 背書指南政策包、行銷部用詞清單與核准價格，結尾附上業務的追蹤連結。",
                        )
                      : t(
                          "Follows the Taiwan Fair Trade pack, marketing's wording lists and approved prices, and ends with the rep's tracked link.",
                          "遵循台灣公平會政策包、行銷部用詞清單與核准價格，結尾附上業務的追蹤連結。",
                        )}
                  </p>
                  {generate.isPending ? (
                    // 2026-09-18 (Dallas booth): the wait is ~10-15 s of dead air
                    // on stage. Show the rules the post has to clear — the list is
                    // static on purpose, no faked per-step progress.
                    <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5 text-[13px] text-orange-900">
                      <div className="flex items-center gap-2 font-medium">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-orange-500" />
                        {t("Writing and checking company policy… (about 15 s)", "撰寫中，並檢查公司政策…（約 15 秒）")}
                      </div>
                      {pendingPack ? (
                        <>
                          <p className="mt-2 text-[12px] text-orange-800">
                            {t(
                              `Every draft has to clear these ${pendingPack.rules.length} checks — ${pendingPack.authority}:`,
                              `每一篇初稿都要通過這 ${pendingPack.rules.length} 道檢查——${pendingPack.authority}：`,
                            )}
                          </p>
                          <ol className="mt-1.5 grid gap-1 sm:grid-cols-2">
                            {pendingPack.rules.map((r, i) => (
                              <li key={r.id} className="flex gap-1.5 text-[12px] leading-relaxed text-orange-800">
                                <span className="tabular-nums opacity-60">{i + 1}.</span>
                                <span>{r.title}</span>
                              </li>
                            ))}
                          </ol>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  <ErrorNote error={generate.error} />
                </div>
              </ModalBody>
              <ModalFooter>
                <button
                  type="button"
                  onClick={() => setActiveSlug(null)}
                  disabled={generate.isPending}
                  className="rounded-lg px-3 py-2 text-[13px] text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
                >
                  {t("Cancel", "取消")}
                </button>
                <button
                  type="button"
                  onClick={run}
                  disabled={!rep || !solutionId || generate.isPending}
                  className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
                  style={{ background: "#F97316" }}
                >
                  {generate.isPending ? t("Writing…", "撰寫中…") : t("Write the post", "產出貼文")}
                </button>
              </ModalFooter>
            </>
          ) : null}
        </ModalContent>
      </Modal>
    </div>
  );
}
