/**
 * RewriteDraftModal — 貼上一段既有文案，改寫成品牌調性版本。
 *
 * 2026-09-16（CJ「要讓用戶可以有地方，輸入原文後改寫就好」）：跟旁邊的
 * 「自建任務卡」不一樣——自建任務卡要示範多篇成品、AI 反推成可重複使用的
 * SKILL；這裡只改這一篇，貼上、送出、拿到結果就結束，不會產生新卡片。
 *
 * 後端只有一個 mutation（quickTask.rewriteDraft），伺服器內部依序跑
 * 診斷→改寫→CTA 三段（見 server/content/core/rewriteDraft.ts），前端不用
 * 自己管多階段狀態。
 */
import React from "react";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import {
  Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Textarea, Input,
} from "@heroui/react";
import { CheckIcon, CopyIcon, GenerateIcon } from "../../../platform/components/icons";
import { showToastGlobal } from "../../../../components/ui/Toast";

export default function RewriteDraftModal({
  isOpen, onClose, brandId,
}: {
  isOpen: boolean;
  onClose: () => void;
  brandId: number | null;
}) {
  const { lang } = useLang();
  const en = lang === "en";
  const [material, setMaterial] = React.useState("");
  const [audience, setAudience] = React.useState("");
  const [copied, setCopied] = React.useState(false);

  const mut = trpc.quickTask.rewriteDraft.useMutation();

  const reset = () => { setMaterial(""); setAudience(""); setCopied(false); mut.reset(); };

  const materialTooShort = material.trim().length > 0 && material.trim().length < 20;

  return (
    <Modal isOpen={isOpen} onClose={() => { onClose(); reset(); }} size="2xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          {en ? "Rewrite existing text" : "貼上原文，直接改寫"}
          <p className="text-[12px] font-normal text-default-500">
            {en ? "Paste something you've already written — get it rewritten in your brand's voice." : "貼上你已經寫好的一段文案，改寫成符合品牌調性的版本。"}
          </p>
        </ModalHeader>
        <ModalBody className="pb-6">
          {!mut.data?.ok ? (
            <>
              <Textarea
                label={en ? "Original text" : "原文案"}
                placeholder={en ? "Paste the text you want rewritten…" : "貼上想改寫的文案…"}
                minRows={6}
                value={material}
                onValueChange={setMaterial}
                isInvalid={materialTooShort}
                errorMessage={materialTooShort ? (en ? "At least 20 characters" : "至少要 20 個字") : undefined}
              />
              <Input
                label={en ? "Target audience (optional)" : "目標讀者（選填）"}
                placeholder={en ? "e.g. new moms 30-40" : "例：30-40 歲新手媽媽"}
                value={audience}
                onValueChange={setAudience}
              />
              {mut.data && mut.data.ok === false && (
                <p className="text-[12px] text-danger-600">{en ? "Rewrite failed, try again." : "改寫失敗，請再試一次。"}</p>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div className="bg-default-50 rounded-lg p-3 text-[13px] whitespace-pre-wrap leading-relaxed">
                {mut.data.rewritten}
              </div>
              {mut.data.cta && (
                <p className="text-[12px]"><span className="font-semibold">CTA：</span>{mut.data.cta}</p>
              )}
              {mut.data.whatChanged && (
                <p className="text-[12px] text-default-500"><span className="font-semibold">{en ? "What changed: " : "改了什麼："}</span>{mut.data.whatChanged}</p>
              )}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          {mut.data?.ok ? (
            <>
              <Button variant="light" onPress={reset}>{en ? "Rewrite another" : "再改一篇"}</Button>
              <Button
                color="primary"
                startContent={copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
                onPress={() => {
                  navigator.clipboard?.writeText(mut.data!.rewritten).then(() => {
                    setCopied(true);
                    showToastGlobal(en ? "Copied" : "已複製", "success");
                    setTimeout(() => setCopied(false), 2000);
                  });
                }}
              >
                {en ? "Copy" : "複製文案"}
              </Button>
            </>
          ) : (
            <Button
              color="primary"
              startContent={<GenerateIcon size={16} />}
              isDisabled={material.trim().length < 20 || mut.isPending}
              isLoading={mut.isPending}
              onPress={() => mut.mutate({ material: material.trim(), audience: audience.trim() || undefined, brandId: brandId ?? undefined })}
            >
              {en ? "Rewrite" : "開始改寫"}
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
