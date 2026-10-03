/**
 * CampaignHandoff — 定稿那一刻跳出來的交接單：策略層 → 內容層。
 *
 * 2026-09-30（CJ「當活動企畫定案的時候，可以有一個動畫，是定位策略企畫的 agent，跳出一個
 * 視窗，交接相關細節給…執行內容企劃的 agent」）。
 *
 * 交接單不是動畫道具：上面每一行（訴求、每一段的訊息）內容層寫每一篇時都會讀到
 * （server/strategy/core/brandContext.ts 的活動區塊）。這裡只是讓人在交出去之前看一眼。
 */
import type { ReactNode } from "react";
import { Button, Modal, ModalContent, ModalBody } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPenNib, faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { CHANNEL_META, channelLabel } from "../../../platform/lib/channelMeta";
import { CAMPAIGN_PHASES, type CampaignPlan } from "../../../strategy/lib/campaignSchema";
import { phaseShort } from "../../../strategy/lib/campaignStage";

export default function CampaignHandoff({ open, onClose, onWrite, plan, lead, mechanic, range, en }: {
  open: boolean; onClose: () => void; onWrite: () => void;
  plan: CampaignPlan; lead: string; mechanic: string; range: string; en: boolean;
}) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const live = plan.items.filter((i) => i.enabled);
  const channels = [...new Set(live.map((i) => i.platform))];
  const pm = plan.phaseMessages ?? {};
  const rows: Array<[string, ReactNode]> = [
    [L("訴求", "Message"), plan.smp],
    [L("主角", "Lead"), lead],
    ...(mechanic ? [[L("機制", "Offer"), mechanic] as [string, ReactNode]] : []),
    [L("期間", "Dates"), range],
    [L("通路", "Channels"), (
      <span className="flex gap-2 flex-wrap">
        {channels.map((c) => (
          <span key={c} className="flex items-center gap-1"><FontAwesomeIcon icon={CHANNEL_META[c]?.icon ?? faPenNib} className="text-tiny" />{channelLabel(c, en)}</span>
        ))}
      </span>
    )],
    [L("篇數", "Posts"), L(`${live.length} 篇`, `${live.length}`)],
  ];

  return (
    <Modal isOpen={open} onClose={onClose} size="lg" backdrop="blur">
      <ModalContent>
        <ModalBody className="py-6 gap-5">
          <style>{`
            @keyframes handoffTravel { 0% { left: 8% ; opacity: 0 } 15% { opacity: 1 } 85% { opacity: 1 } 100% { left: 84%; opacity: 0 } }
            @keyframes handoffIn { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
            @media (prefers-reduced-motion: reduce) { .handoff-doc, .handoff-row { animation: none !important; opacity: 1 !important; } }
          `}</style>
          <div className="relative flex items-center justify-between px-2 h-16">
            <div className="flex flex-col items-center gap-1 z-10">
              <span className="w-11 h-11 rounded-full bg-default-100 grid place-items-center font-bold">{L("策", "S")}</span>
              <span className="text-tiny text-default-500">{L("策略總監", "Strategy")}</span>
            </div>
            <span className="absolute left-[18%] right-[18%] top-[22px] border-t border-dashed border-default-300" />
            <span className="handoff-doc absolute top-[10px] w-6 h-7 rounded bg-content1 border border-foreground grid place-items-center text-[10px]"
              style={{ animation: "handoffTravel 1.4s ease-in-out .2s 2 both" }} aria-hidden>
              <FontAwesomeIcon icon={faPenNib} />
            </span>
            <div className="flex flex-col items-center gap-1 z-10">
              <span className="w-11 h-11 rounded-full bg-foreground text-background grid place-items-center font-bold">{L("內", "C")}</span>
              <span className="text-tiny text-default-500">{L("內容層", "Content")}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-large font-bold">{L("交接單", "Handoff")}</p>
            <p className="text-tiny text-default-500">{L("企劃定稿了。內容層寫每一篇時，都會照這份寫。", "The plan is locked. Every post in Content follows this.")}</p>
          </div>

          <dl className="grid grid-cols-[56px_minmax(0,1fr)] gap-x-3 gap-y-2 text-small">
            {rows.map(([k, v], i) => (
              <div key={k} className="contents">
                <dt className="handoff-row text-default-500" style={{ animation: `handoffIn .3s ease ${0.5 + i * 0.08}s both` }}>{k}</dt>
                <dd className="handoff-row m-0" style={{ animation: `handoffIn .3s ease ${0.5 + i * 0.08}s both` }}>{v}</dd>
              </div>
            ))}
            {CAMPAIGN_PHASES.some((p) => pm[p.id]) && (
              <div className="contents">
                <dt className="handoff-row text-default-500" style={{ animation: `handoffIn .3s ease ${0.5 + rows.length * 0.08}s both` }}>{L("每一段", "Phases")}</dt>
                <dd className="handoff-row m-0 flex flex-col gap-0.5" style={{ animation: `handoffIn .3s ease ${0.5 + rows.length * 0.08}s both` }}>
                  {CAMPAIGN_PHASES.filter((p) => pm[p.id]).map((p) => (
                    <span key={p.id}><b className="font-semibold mr-1.5">{phaseShort(p.id, en)}</b>{pm[p.id]}</span>
                  ))}
                </dd>
              </div>
            )}
          </dl>

          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="light" radius="md" onPress={onClose}>{L("留在這裡", "Stay here")}</Button>
            <Button size="sm" color="primary" radius="md" endContent={<FontAwesomeIcon icon={faArrowRight} />} onPress={onWrite}>
              {L("到內容層寫", "Start writing")}
            </Button>
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
