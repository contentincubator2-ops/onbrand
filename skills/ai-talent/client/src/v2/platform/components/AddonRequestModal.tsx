/**
 * AddonRequestModal — 申請加購「電商營運報告」。
 *
 * 2026-09-21（CJ「請把『可加購成效層』接上真正的購買路徑」）：這個加購是建置費
 * ＋月維運，範圍要先確認後台資料權限與工作說明書，所以不是按下去就扣款——
 * 這裡是「填品項數與後台平台 → 當場看到試算報價 → 送出申請」，SoWork 業務會用
 * 登入信箱聯繫，簽約後才開通、才開始計費。畫面上把這個順序講清楚，避免用戶
 * 以為送出就已經買了。
 *
 * 一位用戶同時只會有一筆進行中的申請；已經送過就顯示那一筆，不再讓他填一次。
 */
import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Textarea,
} from "@heroui/react";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import { useScopeState } from "../../app/shell/ScopeBar";

const fmt = (n: number) => `NT$${n.toLocaleString("en-US")}`;

export default function AddonRequestModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { lang } = useLang();
  const en = lang === "en";
  const navigate = useNavigate();
  const [scope] = useScopeState();

  const [skus, setSkus] = React.useState("20");
  const [storePlatform, setStorePlatform] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const utils = trpc.useUtils();
  const statusQ = trpc.addon.status.useQuery(undefined, { enabled: isOpen });
  const skuNum = Number(skus);
  const skuValid = Number.isInteger(skuNum) && skuNum >= 1 && skuNum <= 100000;
  const quoteQ = trpc.addon.quote.useQuery({ skus: skuValid ? skuNum : 1 }, { enabled: isOpen && skuValid });
  const requestMut = trpc.addon.request.useMutation({
    onSuccess: () => { void utils.addon.status.invalidate(); },
  });

  const open = (statusQ.data?.requests ?? []).find((r) => r.status === "new" || r.status === "contacted");
  const submitted = requestMut.data?.request ?? open;
  const q = quoteQ.data;

  const moneyLine = (r: { projectQuote: boolean; oneTimeTwd: number | null; monthlyTwd: number | null } | undefined) => {
    if (!r) return "";
    if (r.projectQuote) return en ? "Over 200 SKUs is quoted per project — sales will send a quote." : "超過 200 品項為專案報價，業務會另行報價。";
    return en
      ? `Setup ${fmt(r.oneTimeTwd ?? 0)} + ${fmt(r.monthlyTwd ?? 0)} / month (excl. tax)`
      : `建置 ${fmt(r.oneTimeTwd ?? 0)} ＋ 月費 ${fmt(r.monthlyTwd ?? 0)}（未稅）`;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          {en ? "Request add-on: E-commerce operations report" : "申請加購：電商營運報告"}
          <p className="text-[12px] font-normal text-default-500">
            {en
              ? "After you submit, SoWork sales contacts you at your login email to confirm data access and the statement of work. Billing starts only after you sign."
              : "送出後，SoWork 業務會用你的登入信箱聯繫，確認後台資料權限與工作說明書；簽約後才開通、才開始計費。"}
          </p>
        </ModalHeader>
        <ModalBody className="pb-4">
          {statusQ.isLoading ? (
            <p className="text-[12px] text-default-500">{en ? "Loading…" : "載入中…"}</p>
          ) : !statusQ.data?.eligible ? (
            <p className="text-[13px] text-default-700">
              {en
                ? "This add-on requires an active onBrand Studio Professional (NT$9,000 / month) subscription."
                : "這個加購須搭配 onBrand Studio 專業版（NT$9,000／月）訂閱。"}
            </p>
          ) : submitted ? (
            <div className="space-y-2 text-[13px]">
              <p className="font-semibold">
                {requestMut.data?.alreadyOpen
                  ? (en ? "You already have a request in progress." : "你已經有一筆申請在進行中。")
                  : (en ? "Request received." : "申請已送出。")}
              </p>
              <div className="bg-default-50 rounded-lg p-3 space-y-1 text-[12px]">
                <p>{en ? `Request #${submitted.id}` : `申請編號 #${submitted.id}`}</p>
                <p>{en ? `${submitted.skus} SKUs` : `${submitted.skus} 品項`}{submitted.storePlatform ? `・${submitted.storePlatform}` : ""}</p>
                <p>{moneyLine({ projectQuote: submitted.projectQuote, oneTimeTwd: submitted.quotedOneTimeTwd, monthlyTwd: submitted.quotedMonthlyTwd })}</p>
                <p className="text-default-500">
                  {submitted.status === "contacted"
                    ? (en ? "Status: sales has contacted you." : "狀態：業務已聯繫。")
                    : (en ? "Status: waiting for sales to contact you." : "狀態：等待業務聯繫。")}
                </p>
              </div>
            </div>
          ) : (
            <>
              <Input
                type="number"
                label={en ? "Number of SKUs" : "品項數"}
                description={en ? "Base scope is up to 20 SKUs; more SKUs use the tier surcharge." : "基本範圍為 20 品項內，超過依級距加購。"}
                value={skus}
                onValueChange={setSkus}
                isInvalid={!skuValid}
                errorMessage={!skuValid ? (en ? "Enter a whole number, 1 or more" : "請輸入 1 以上的整數") : undefined}
              />
              <Input
                label={en ? "Store back-office platform (optional)" : "後台平台（選填）"}
                placeholder={en ? "e.g. Shopline, 91APP, Shopify" : "例：Shopline、91APP、Shopify"}
                value={storePlatform}
                onValueChange={setStorePlatform}
              />
              <Textarea
                label={en ? "Notes (optional)" : "備註（選填）"}
                placeholder={en ? "Anything sales should know first" : "想先讓業務知道的事"}
                minRows={2}
                value={notes}
                onValueChange={setNotes}
              />
              {skuValid && q && (
                <div className="bg-default-50 rounded-lg p-3 text-[13px]">
                  <span className="font-semibold">{en ? "Estimate: " : "試算："}</span>{moneyLine(q)}
                </div>
              )}
              {requestMut.error && (
                <p className="text-[12px] text-danger-600">{requestMut.error.message}</p>
              )}
            </>
          )}
        </ModalBody>
        <ModalFooter>
          {!statusQ.isLoading && !statusQ.data?.eligible ? (
            <Button color="primary" onPress={() => { onClose(); navigate("/pricing"); }}>
              {en ? "See plans" : "查看方案"}
            </Button>
          ) : submitted ? (
            <Button onPress={onClose}>{en ? "Close" : "關閉"}</Button>
          ) : (
            <>
              <Button variant="light" onPress={onClose}>{en ? "Cancel" : "取消"}</Button>
              <Button
                color="primary"
                isDisabled={!skuValid || requestMut.isPending || statusQ.isLoading}
                isLoading={requestMut.isPending}
                onPress={() => requestMut.mutate({
                  skus: skuNum,
                  storePlatform: storePlatform.trim() || undefined,
                  notes: notes.trim() || undefined,
                  brandId: scope.brandId ?? undefined,
                })}
              >
                {en ? "Submit request" : "送出申請"}
              </Button>
            </>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
