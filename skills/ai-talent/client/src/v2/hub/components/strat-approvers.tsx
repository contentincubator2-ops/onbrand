/**
 * 核准名單的管理 UI。
 *
 * 2026-09-23 (CJ「做核准人名單的管理 UI」)。後端（listApprovers / addApprover /
 * removeApprover / canApprove）早就在了，一直沒有地方可以按。
 *
 * ── 這個畫面的重點不是那份名單，是那條規則 ───────────────────────────
 * 規則本身有一個會咬人的地方：**名單空的時候退回「平台管理員可以核准」，
 * 但只要名單上有一個人，平台管理員就不算數了**。這是故意的（不然名單等於
 * 沒有作用），可是對按下「加入」的人來說完全看不出來——他以為自己是在「多加
 * 一個人」，實際上是在「把核准權整批換掉」。
 *
 * 所以這個 modal 花在警告上的篇幅比花在表單上的多。三個都是真的會發生的：
 *
 *   1. 加第一個人 = 交出自己的核准權。加之前就要講。
 *   2. 名單上只有一個人 = 他自己提的修改永遠沒人能核准（提案人不能核准自己的
 *      提案，approveEdit 會擋）。一個人的名單看起來很正常，其實是半個死結。
 *   3. email 打錯 = 那一列看起來好好的，但那個人登不進來。名單非空又把管理員
 *      擋在外面，於是整個組織沒有人能核准任何東西。所以每一列都標記這個 email
 *      在系統裡有沒有帳號。
 *
 * 這些都不是假設，是照著 solutionEdits.ts 的 canApprove／approveEdit 推出來的
 * 結果。畫面上講清楚，比事後在 log 裡找「為什麼核准鈕按不下去」便宜太多。
 */
import React, { useState } from "react";
import { AlertTriangle, Plus, ShieldCheck, Trash2, UserX } from "lucide-react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/react";
import { trpc } from "../../../lib/trpc";
import { ErrorNote } from "../ui";
import { useT } from "../lang";

export interface Approver {
  id: number;
  email: string;
  addedBy: string | null;
  hasLogin: boolean;
}

/** 名單目前的狀態，一句話。按鈕跟 modal 標題共用。 */
function summarise(t: (en: string, zh: string) => string, approvers: Approver[]) {
  if (!approvers.length) return t("Approvers: platform admins", "核准權限：平台管理員");
  return t(`Approvers: ${approvers.length}`, `核准權限：${approvers.length} 人`);
}

/** 有沒有需要提醒的事。決定按鈕要不要變成警告色。 */
function hasTrouble(approvers: Approver[]) {
  return approvers.length === 1 || approvers.some((a) => !a.hasLogin);
}

export function ApproverButton({
  approvers,
  isPlatformAdmin,
  me,
  onChanged,
}: {
  approvers: Approver[];
  isPlatformAdmin: boolean;
  me: string;
  onChanged: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const trouble = hasTrouble(approvers);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-medium transition " +
          (trouble
            ? "border-amber-300 bg-amber-50 text-amber-800 hover:border-amber-500"
            : "border-neutral-300 text-neutral-600 hover:border-neutral-500 hover:text-neutral-900")
        }
      >
        {trouble ? <AlertTriangle className="h-3 w-3" aria-hidden /> : <ShieldCheck className="h-3 w-3" aria-hidden />}
        {summarise(t, approvers)}
      </button>
      {open ? (
        <ApproverModal
          approvers={approvers}
          isPlatformAdmin={isPlatformAdmin}
          me={me}
          onClose={() => setOpen(false)}
          onChanged={onChanged}
        />
      ) : null}
    </>
  );
}

function ApproverModal({
  approvers,
  isPlatformAdmin,
  me,
  onClose,
  onChanged,
}: {
  approvers: Approver[];
  isPlatformAdmin: boolean;
  me: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  const set = trpc.hub.admin.setApprover.useMutation();
  const [email, setEmail] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);

  const clean = email.trim().toLowerCase();
  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean);
  const duplicate = approvers.some((a) => a.email === clean);
  const empty = approvers.length === 0;
  const onList = approvers.some((a) => a.email === me.trim().toLowerCase());

  const run = async (input: { email?: string; removeId?: number }) => {
    await set.mutateAsync(input);
    setEmail("");
    setConfirmRemove(null);
    onChanged();
  };

  return (
    <Modal isOpen size="2xl" scrollBehavior="inside" onClose={() => !set.isPending && onClose()}>
      <ModalContent>
        <ModalHeader className="flex flex-col gap-0.5">
          <span className="text-[16px] font-semibold">{t("Who can approve", "誰可以核准")}</span>
          <span className="text-[12px] font-normal text-neutral-500">
            {t(
              "Approving merges a proposed change into what reps and the AI actually say.",
              "核准會把提案合併成業務與 AI 真正會講的內容。",
            )}
          </span>
        </ModalHeader>

        <ModalBody>
          {/* 規則本身。名單是空的時候這是最重要的一段，因為空名單看起來像是
              「沒有人能核准」，實際上剛好相反。 */}
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-[12.5px] leading-relaxed text-neutral-700">
            <div className="font-semibold text-neutral-800">{t("The rule", "規則")}</div>
            <p className="mt-1">
              {empty
                ? t(
                    "The list is empty, so every platform admin can approve. Add anyone and that stops — from then on only the people on this list can approve, admins included.",
                    "名單是空的，所以每一位平台管理員都能核准。只要加入任何一個人就不再是這樣——之後只有名單上的人能核准，平台管理員也一樣。",
                  )
                : t(
                    "Only the people on this list can approve. Platform admins who are not on it cannot — that is what having a list means.",
                    "只有名單上的人能核准。不在名單上的平台管理員不能——這就是有名單的意思。",
                  )}
            </p>
            <p className="mt-1.5 text-neutral-600">
              {t(
                "Nobody can approve their own proposal, whoever they are.",
                "不管是誰，都不能核准自己提出的修改。",
              )}
            </p>
          </div>

          {/* 會咬人的三件事。只在真的成立的時候出現，不是常駐的警語牆。 */}
          {approvers.length === 1 ? (
            <Warn>
              {t(
                "Only one person is on the list. Because nobody can approve their own proposal, anything that person proposes has nobody to approve it. Add a second approver.",
                "名單上只有一個人。因為沒有人能核准自己的提案，這個人提出的任何修改都不會有人能核准。請再加一位。",
              )}
            </Warn>
          ) : null}

          {approvers.some((a) => !a.hasLogin) ? (
            <Warn>
              {t(
                "Someone on the list has no account here. They cannot sign in, so they cannot approve anything — check the address for a typo.",
                "名單上有人在系統裡沒有帳號。他登不進來，也就核准不了任何東西——請檢查那個 email 有沒有打錯。",
              )}
            </Warn>
          ) : null}

          {isPlatformAdmin && !empty && !onList ? (
            <Warn>
              {t(
                `You are a platform admin but not on this list, so you cannot approve anything right now (${me}).`,
                `你是平台管理員，但不在這份名單上，所以你現在不能核准任何東西（${me}）。`,
              )}
            </Warn>
          ) : null}

          <div className="mt-3">
            <div className="mb-1.5 text-[12px] font-semibold text-neutral-700">
              {empty ? t("Nobody listed yet", "名單目前是空的") : t("On the list", "名單")}
            </div>
            {empty ? (
              <p className="text-[13px] text-neutral-500">
                {t("Platform admins can approve until someone is added.", "在加入任何人之前，平台管理員可以核准。")}
              </p>
            ) : (
              <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                {approvers.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] text-neutral-800">{a.email}</span>
                        {a.email === me.trim().toLowerCase() ? (
                          <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10.5px] text-neutral-600">
                            {t("you", "你")}
                          </span>
                        ) : null}
                        {!a.hasLogin ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-medium text-amber-800">
                            <UserX className="h-2.5 w-2.5" aria-hidden />
                            {t("no account", "沒有帳號")}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[11.5px] text-neutral-500">
                        {a.addedBy ? t(`added by ${a.addedBy}`, `由 ${a.addedBy} 加入`) : t("added during setup", "建置時加入")}
                      </div>
                    </div>
                    {isPlatformAdmin ? (
                      confirmRemove === a.id ? (
                        <span className="flex items-center gap-1.5">
                          <span className="text-[11.5px] text-neutral-500">
                            {approvers.length === 1
                              ? t("Removing the last one hands approval back to platform admins.", "移除最後一位，核准權會回到平台管理員。")
                              : t("Remove?", "確定移除？")}
                          </span>
                          <button
                            type="button"
                            disabled={set.isPending}
                            onClick={() => void run({ removeId: a.id })}
                            className="rounded-lg bg-red-600 px-2 py-1 text-[12px] font-medium text-white disabled:opacity-50"
                          >
                            {t("Remove", "移除")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRemove(null)}
                            className="rounded-lg border border-neutral-300 px-2 py-1 text-[12px] text-neutral-600"
                          >
                            {t("Cancel", "取消")}
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmRemove(a.id)}
                          className="inline-flex items-center gap-1 text-[12px] text-neutral-500 hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          {t("Remove", "移除")}
                        </button>
                      )
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {isPlatformAdmin ? (
            <div className="mt-3 rounded-lg border border-neutral-200 p-3">
              <div className="text-[12px] font-semibold text-neutral-700">{t("Add an approver", "加入核准人")}</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="min-w-[220px] flex-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-[13px] outline-none focus:border-orange-500"
                />
                <button
                  type="button"
                  disabled={!validEmail || duplicate || set.isPending}
                  onClick={() => void run({ email: clean })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  {set.isPending ? t("Adding…", "加入中…") : t("Add", "加入")}
                </button>
              </div>
              {duplicate ? (
                <p className="mt-1.5 text-[11.5px] text-neutral-500">{t("Already on the list.", "已經在名單上了。")}</p>
              ) : empty && validEmail ? (
                // 這句只在「按下去就會改變規則」的那一刻出現，也就是名單還空著、
                // 而且 email 已經填好的時候。常駐的話就變成背景雜訊了。
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-amber-800">
                  {t(
                    "Adding the first approver takes approval away from every platform admin, including you unless you add yourself too.",
                    "加入第一位核准人，會把核准權從所有平台管理員手上拿走——包括你，除非你也把自己加進來。",
                  )}
                </p>
              ) : (
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-neutral-500">
                  {t(
                    "The address has to match an account here, otherwise the person can't sign in to approve.",
                    "這個 email 要對得上系統裡的帳號，否則那個人登不進來，也就核准不了。",
                  )}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-[12px] text-neutral-500">
              {t(
                "Only a platform admin can change this list.",
                "只有平台管理員可以更動這份名單。",
              )}
            </p>
          )}

          <ErrorNote error={set.error} />
        </ModalBody>

        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={set.isPending}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-[13px] text-neutral-700 disabled:opacity-50"
          >
            {t("Close", "關閉")}
          </button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-[12.5px] leading-relaxed text-amber-900">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}
