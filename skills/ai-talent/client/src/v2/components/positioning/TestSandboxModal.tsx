/**
 * TestSandboxModal — inline 🧪 測試 sandbox.
 *
 * Lives on Brand page (does NOT navigate away). User picks platform +
 * topic, clicks 產生, sees a single caption draft generated using
 * current positioning + uploaded knowledge. Useful for sanity-checking
 * the brand voice before committing 定案.
 */
import { useState } from "react";
import { trpc } from "../../../lib/trpc";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input, Select, SelectItem, Card, CardBody } from "@heroui/react";
import { FlaskConical, Sparkles } from "lucide-react";

const PLATFORMS = [
  { v: "facebook",  label: "Facebook" },
  { v: "instagram", label: "Instagram" },
  { v: "youtube",   label: "YouTube" },
  { v: "tiktok",    label: "TikTok" },
  { v: "linkedin",  label: "LinkedIn" },
  { v: "email",     label: "Email / EDM" },
];

export default function TestSandboxModal({
  isOpen, onClose, brandId,
}: { isOpen: boolean; onClose: () => void; brandId: number | null }) {
  const [platform, setPlatform] = useState<string>("facebook");
  const [topic, setTopic] = useState("");
  const [output, setOutput] = useState<string>("");
  const [meta, setMeta] = useState<{ knowledge: boolean; positioning: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const testMut = (trpc as any).positioningJobs?.testCaption?.useMutation?.();

  const handleRun = async () => {
    if (!brandId || !topic.trim()) return;
    setErr(null); setOutput(""); setMeta(null);
    try {
      const r = await testMut?.mutateAsync?.({
        brandId,
        topic: topic.trim(),
        platform: platform as any,
      });
      if (r?.ok === false) { setErr(r.error || "產生失敗"); return; }
      setOutput(r?.caption ?? "");
      setMeta({ knowledge: !!r?.hasKnowledge, positioning: !!r?.hasPositioning });
    } catch (e: any) { setErr(String(e?.message ?? e)); }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" backdrop="blur" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
            <FlaskConical size={16} className="text-indigo-600" />
          </div>
          <span className="text-lg font-semibold">測試品牌定位</span>
          <span className="text-xs text-default-500 font-normal">— 即時試寫一段，看品牌定位 + 知識庫的效果</span>
        </ModalHeader>
        <ModalBody className="pb-2 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Select
              label="平台"
              selectedKeys={[platform]}
              onSelectionChange={(keys) => setPlatform(Array.from(keys)[0] as string)}
              size="sm"
            >
              {PLATFORMS.map(p => <SelectItem key={p.v}>{p.label}</SelectItem>)}
            </Select>
            <div className="col-span-2">
              <Input
                label="主題 / 情境"
                placeholder="例：端午節限定優惠 · 新品上市懶人包 · 客戶見證改寫"
                value={topic}
                onValueChange={setTopic}
                size="sm"
              />
            </div>
          </div>

          {err && <div className="text-sm text-danger px-1">{err}</div>}

          {output && (
            <Card className="border-2 border-indigo-200">
              <CardBody className="p-4">
                <div className="flex items-center gap-2 mb-2 text-xs text-default-500">
                  <Sparkles size={12} className="text-indigo-500" />
                  <span>試寫結果</span>
                  {meta && (
                    <>
                      <span className="ml-auto px-2 py-0.5 rounded-full text-[10px]"
                        style={{ background: meta.positioning ? "#D1FAE5" : "#FEF3C7", color: meta.positioning ? "#047857" : "#92400E" }}>
                        {meta.positioning ? "已套用品牌定位" : "未套用定位"}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px]"
                        style={{ background: meta.knowledge ? "#D1FAE5" : "#F3F4F6", color: meta.knowledge ? "#047857" : "#6B7280" }}>
                        {meta.knowledge ? "已套用知識庫" : "無知識庫"}
                      </span>
                    </>
                  )}
                </div>
                <pre className="text-sm text-default-800 whitespace-pre-wrap font-sans leading-relaxed">{output}</pre>
              </CardBody>
            </Card>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>關閉</Button>
          <Button
            color="primary"
            onPress={handleRun}
            isLoading={testMut?.isPending}
            isDisabled={!brandId || !topic.trim()}
            startContent={!testMut?.isPending && <Sparkles size={14} />}
          >
            {output ? "再生一次" : "產生試寫"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
