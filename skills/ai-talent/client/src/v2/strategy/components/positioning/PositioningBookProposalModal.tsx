/**
 * PositioningBookProposalModal — 草擬好的品牌定位書提案：閱讀、複製、下載、重新草擬。
 *
 * 2026-10-10（CJ「全部完成後，也可以像活動定位一樣，產出草擬提案」）。提案是照卡片寫的
 * 成品，要改內容回卡片改再重新草擬——這裡不做第二個編輯入口，免得提案跟卡片各說各話。
 */
import React from "react";
import { Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { faRotateLeft } from "@fortawesome/free-solid-svg-icons";
import { useLang } from "../../../../lib/i18n";
import { DraftProposalButton } from "../events/CampaignProposalPanel";

export default function PositioningBookProposalModal({
  open, proposal, brandName, drafting, onRedraft, onClose,
}: {
  open: boolean;
  proposal: { text: string; at: string; stale: boolean } | null;
  brandName: string;
  /** 重新草擬中的進度；null＝沒在草擬。 */
  drafting: number | null;
  onRedraft: () => void;
  onClose: () => void;
}) {
  const { lang } = useLang();
  const en = lang === "en";
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    if (!proposal) return;
    try {
      await navigator.clipboard.writeText(proposal.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* 瀏覽器不給剪貼簿：下載還能用 */ }
  };

  const download = () => {
    if (!proposal) return;
    const url = URL.createObjectURL(new Blob([proposal.text], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${brandName || (en ? "brand" : "品牌")}-${en ? "positioning-book" : "品牌定位書"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal isOpen={open} onOpenChange={(v) => { if (!v) onClose(); }} size="4xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span className="text-medium font-semibold">{en ? "Positioning proposal — draft" : "品牌定位書提案（草稿）"}</span>
          <span className="text-tiny font-normal text-default-500">
            {proposal?.stale
              ? (en ? "Cards were changed after this draft was written. Redraft to bring it up to date." : "這份草稿寫好之後，卡片又改過了。重新草擬才會是最新的。")
              : (en ? "Written from your cards, in their order. To change it, edit the cards and redraft." : "照你的卡片與順序寫的。要改內容，回卡片改完再重新草擬。")}
          </span>
        </ModalHeader>
        <ModalBody>
          {/* 專案沒有裝 typography plugin，prose 類別不會生效——標題與段落的樣式直接寫在這裡。 */}
          <article className="text-[14px] leading-relaxed text-neutral-800">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => <h1 className="m-0 mb-4 text-[21px] font-bold text-neutral-900">{children}</h1>,
                h2: ({ children }) => <h2 className="m-0 mb-2 mt-7 border-b border-neutral-200 pb-1.5 text-[16px] font-bold text-neutral-900">{children}</h2>,
                h3: ({ children }) => <h3 className="m-0 mb-1.5 mt-4 text-[14.5px] font-semibold text-neutral-900">{children}</h3>,
                p: ({ children }) => <p className="m-0 mb-3">{children}</p>,
                ul: ({ children }) => <ul className="m-0 mb-3 list-disc pl-5">{children}</ul>,
                ol: ({ children }) => <ol className="m-0 mb-3 list-decimal pl-5">{children}</ol>,
                li: ({ children }) => <li className="mb-1">{children}</li>,
                blockquote: ({ children }) => <blockquote className="m-0 mb-3 border-l-2 border-neutral-300 pl-3 text-neutral-700">{children}</blockquote>,
                strong: ({ children }) => <strong className="font-semibold text-neutral-900">{children}</strong>,
              }}
            >
              {proposal?.text ?? ""}
            </ReactMarkdown>
          </article>
        </ModalBody>
        <ModalFooter className="justify-between">
          <DraftProposalButton en={en} icon={faRotateLeft} label={en ? "Redraft" : "重新草擬"} progress={drafting} onPress={onRedraft} />
          <div className="flex gap-2">
            <Button size="sm" variant="flat" onPress={copy}>{copied ? (en ? "Copied" : "已複製") : (en ? "Copy" : "複製全文")}</Button>
            <Button size="sm" color="primary" onPress={download}>{en ? "Download" : "下載"}</Button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
