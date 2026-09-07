/**
 * CardDetailDrawer — 一張任務卡的「憑什麼」：用途、什麼時候用、出處與背後邏輯、
 * 需要你提供什麼、上架日期、屬於哪個方案。
 *
 * 2026-09-08 (CJ「任務卡可以點選看出處、看我們跟的爆款結構來源是什麼、看長青的
 * 背後邏輯是什麼，加上日期」＋「任務卡有名字，但也不知道該名字代表的意思」)
 *
 * 資料全部來自 quickTask.cardDetail：出處是模型實際被餵的那一則參考，長青的
 * 邏輯來自 evergreenRationale，日期來自 git 歷史。這裡只負責排版，不另外編故事。
 */
import type { ReactNode } from "react";
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Button } from "@heroui/react";
import { trpc } from "../../../../lib/trpc";
import { tierLabel } from "../../../platform/lib/tierVocabulary";
import { resolveSource, sourceLabel, sourceWhy } from "../../lib/sourceVocabulary";

interface Props {
  taskId: string | null;
  lang: string;
  onClose: () => void;
  /** 「用這張卡」—— 由頁面接回它原本的 openTask。 */
  onRun?: (taskId: string) => void;
}

export const NEW_WINDOW_DAYS = 30;

export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(`${iso}T00:00:00Z`).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function isRecentCard(iso: string | null | undefined): boolean {
  const d = daysSince(iso);
  return d !== null && d <= NEW_WINDOW_DAYS;
}

function fmtDay(iso: string, en: boolean): string {
  const [y, m, d] = iso.split("-");
  return en ? `${y}-${m}-${d}` : `${y} 年 ${Number(m)} 月 ${Number(d)} 日`;
}

/** 「什麼時候用」—— 由來源類型決定，不是每張卡各寫一句。 */
function whenToUse(type: string, en: boolean): string {
  switch (type) {
    case "viral":
      return en
        ? "When you want a structure that has already been proven to travel. Check the measured month: the older it is, the more you should re-verify."
        : "想跟上已經驗證會傳開的結構時用。留意量測年月，越舊越要重看一次。";
    case "award":
      return en
        ? "For flagship content that needs a complete narrative mechanism, not a quick post."
        : "做主打內容、需要完整敘事機制時用，不是日常一篇。";
    case "benchmark":
      return en
        ? "When you want everyday content to read like the benchmark brands, not like a template."
        : "想讓日常內容寫得像標竿品牌、而不是像範本時用。";
    case "brand-method":
      return en ? "This card grew out of your own methodology. Only you have it." : "這張卡從你自己的方法論長出來，只有你有。";
    case "channel-spec":
      return en ? "When the deliverable must follow the channel field spec." : "交付必須符合通路欄位規格時用。";
    default:
      return en
        ? "The everyday staple. Works any time; it is the structure your scheduled posts fall back on."
        : "日常排程的基本款，任何時候都能用；排程沒靈感時就用它。";
  }
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3 py-2.5 border-b border-neutral-100 last:border-b-0">
      <div className="text-[12px] text-neutral-500 pt-0.5">{label}</div>
      <div className="text-[14px] text-neutral-800 leading-relaxed">{children}</div>
    </div>
  );
}

export default function CardDetailDrawer({ taskId, lang, onClose, onRun }: Props) {
  const en = lang === "en";
  const q = (trpc as any).quickTask?.cardDetail?.useQuery
    ? (trpc as any).quickTask.cardDetail.useQuery({ taskId: taskId ?? "" }, { enabled: !!taskId, staleTime: 5 * 60_000 })
    : { data: null, isLoading: false, error: null };
  const d = q.data as any;
  const src = resolveSource(d?.source);
  const full = (d?.source ?? {}) as { short?: string; takeaway?: string; metric?: string; asOf?: string };
  const age = daysSince(d?.addedAt);
  const isNew = age !== null && age <= NEW_WINDOW_DAYS;

  return (
    <Modal isOpen={!!taskId} onClose={onClose} size="2xl" scrollBehavior="inside" backdrop="opaque">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1 pb-2">
          <div className="text-[12px] text-neutral-500">
            {en ? "About this card" : "這張卡的出處與說明"}
          </div>
          <div className="text-[18px] font-semibold leading-tight">
            {d ? (en ? (d.labelEn || d.labelZh) : (d.labelZh || d.labelEn)) : (en ? "Loading…" : "讀取中…")}
          </div>
          {d && (
            <div className="flex flex-wrap gap-2 text-[12px] text-neutral-500">
              <span className="rounded-full border border-neutral-200 px-2 py-0.5">{tierLabel(d.tier, lang)}</span>
              <span className="rounded-full border border-neutral-200 px-2 py-0.5">{sourceLabel(src.type, lang)}</span>
              {isNew && (
                <span className="rounded-full border border-neutral-900 px-2 py-0.5 text-neutral-900">
                  {en ? "New" : "新上架"}
                </span>
              )}
            </div>
          )}
        </ModalHeader>
        <ModalBody className="pb-4">
          {q.error && (
            <p className="text-[13px] text-neutral-500">
              {en ? "Could not load this card." : "讀不到這張卡的資料。"}
            </p>
          )}
          {d && (
            <div>
              <Row label={en ? "What it makes" : "用途"}>
                {en ? (d.descriptionEn || d.descriptionZh) : (d.descriptionZh || d.descriptionEn)}
              </Row>
              <Row label={en ? "When to use" : "什麼時候用"}>{whenToUse(src.type, en)}</Row>
              <Row label={en ? "Source" : "出處"}>
                <div className="flex flex-col gap-1.5">
                  <div className="text-[13px] text-neutral-500">{sourceWhy(src.type, lang)}</div>
                  {full.short && <div className="font-medium">{full.short}</div>}
                  {full.metric && (
                    <div className="text-[13px]">
                      {full.metric}
                      {full.asOf && <span className="text-neutral-500">{en ? ` · measured ${full.asOf}` : ` · ${full.asOf} 量測`}</span>}
                    </div>
                  )}
                  {full.takeaway && (
                    <div className="text-[13px]">
                      <span className="text-neutral-500">{en ? "Transferable structure: " : "可遷移的結構："}</span>
                      {full.takeaway}
                    </div>
                  )}
                  {d.craftRef && (
                    <div className="mt-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-[13px] leading-relaxed text-neutral-700">
                      <div className="text-[11px] uppercase tracking-wide text-neutral-400 mb-1">
                        {en ? "The reference the model is actually given" : "模型實際被餵的參考"}
                      </div>
                      {d.craftRef}
                    </div>
                  )}
                  {d.rationale && (
                    <div className="mt-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-[13px] leading-relaxed text-neutral-700">
                      <div className="text-[11px] uppercase tracking-wide text-neutral-400 mb-1">
                        {en ? "Why this structure holds" : "背後的邏輯"}
                      </div>
                      {d.rationale}
                    </div>
                  )}
                </div>
              </Row>
              {Array.isArray(d.inputs) && d.inputs.length > 0 && (
                <Row label={en ? "You provide" : "需要你提供"}>
                  <ul className="list-disc pl-4 text-[13px]">
                    {d.inputs.map((i: any) => (
                      <li key={i.key}>
                        {i.label}
                        {i.required ? "" : <span className="text-neutral-400">{en ? " (optional)" : "（選填）"}</span>}
                      </li>
                    ))}
                  </ul>
                </Row>
              )}
              <Row label={en ? "Published" : "上架日期"}>
                {d.addedAt
                  ? <>{fmtDay(d.addedAt, en)}{age !== null && <span className="text-neutral-500">{en ? ` · ${age} days ago` : ` · ${age} 天前`}</span>}</>
                  : <span className="text-neutral-500">{en ? "Your own card" : "你自己建的卡"}</span>}
              </Row>
              <Row label={en ? "Plan" : "方案"}>
                {d.planTier === "pro"
                  ? (en ? "Professional (viral-structure cards)" : "專業方案（爆款結構卡）")
                  : (en ? "Basic and Professional" : "基礎與專業都有")}
              </Row>
            </div>
          )}
        </ModalBody>
        <ModalFooter className="pt-0">
          <Button variant="light" onPress={onClose}>{en ? "Close" : "關閉"}</Button>
          {d && onRun && (
            <Button className="bg-neutral-900 text-white" onPress={() => onRun(d.id)}>
              {en ? "Use this card" : "用這張卡"}
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
