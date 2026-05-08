/**
 * PricingInfoModal — informational pricing card.
 *
 * 2026-05-08 (CJ): "方案和定價" button used to be a no-op; now opens
 * this modal to communicate trial/paid plan structure. No payment
 * gateway yet — paid users contact support to upgrade.
 */
import { Modal, ModalContent, ModalBody, Button } from "@heroui/react";
import { Sparkles, Mail } from "lucide-react";
import { trpc } from "../../lib/trpc";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const PLANS = [
  {
    name: "試用",
    price: "免費",
    badge: "現在",
    credits: 500,
    cap: "每日 ~$5 USD 上限",
    features: [
      "30s / 60s / 100s 任務",
      "Theater 內容企劃台",
      "品牌定位 14-step pipeline",
      "全平台 mockup 預覽",
    ],
    cta: null,
    highlight: true,
  },
  {
    name: "Starter",
    price: "NT$ 990 / 月",
    credits: 1500,
    cap: "每日 $50 USD 上限",
    features: [
      "試用全部功能",
      "更多月度 credits",
      "進階 AI 指令庫",
      "Email 客服",
    ],
    cta: "聯絡客服",
    highlight: false,
  },
  {
    name: "Professional",
    price: "NT$ 4,990 / 月",
    credits: 15000,
    cap: "每日 $50 USD 上限",
    features: [
      "Starter 全部功能",
      "10× credits",
      "100s 研究級 pipeline 加速",
      "優先客服",
    ],
    cta: "聯絡客服",
    highlight: false,
  },
  {
    name: "Enterprise",
    price: "客製",
    credits: 150000,
    cap: "彈性",
    features: [
      "Professional 全部功能",
      "團隊共用點數池",
      "API 整合 / 私有部署",
      "專屬 CSM",
    ],
    cta: "洽談合作",
    highlight: false,
  },
];

export default function PricingInfoModal({ isOpen, onClose }: Props) {
  // Show user's current balance if available
  const balanceQuery = (trpc as any).credits?.getBalance?.useQuery?.(undefined, {
    enabled: isOpen,
    refetchOnWindowFocus: false,
  });
  const balance = (balanceQuery?.data as any) ?? null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl" scrollBehavior="inside" backdrop="blur">
      <ModalContent>
        <ModalBody className="p-0">
          {/* Header */}
          <div
            className="px-6 py-5 text-white"
            style={{ background: "linear-gradient(135deg, #00b4bc 0%, #7c3aed 100%)" }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={16} />
              <span className="text-xs font-semibold uppercase tracking-widest opacity-90">方案和定價</span>
            </div>
            <h1 className="text-2xl font-semibold">選擇適合你的方案</h1>
            {balance && (
              <p className="text-sm opacity-90 mt-1">
                你目前還有 <span className="font-bold">{(balance as any)?.totalAvailable ?? 0}</span> credits
              </p>
            )}
          </div>

          {/* Plans */}
          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={`rounded-2xl border p-4 flex flex-col ${
                  p.highlight ? "border-violet-300 bg-violet-50/40 ring-2 ring-violet-200"
                              : "border-default-200 bg-white"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold text-default-900">{p.name}</span>
                  {p.badge && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                      style={{ background: "#7C3AED" }}>
                      {p.badge}
                    </span>
                  )}
                </div>
                <div className="text-lg font-semibold text-default-900 mb-1">{p.price}</div>
                <div className="text-xs text-default-500 mb-3 leading-snug">
                  <div>{p.credits.toLocaleString()} credits / 月</div>
                  <div>{p.cap}</div>
                </div>
                <ul className="text-xs text-default-700 space-y-1 mb-4 flex-1">
                  {p.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-emerald-500 mt-0.5">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {p.cta && (
                  <Button
                    size="sm"
                    color="primary"
                    variant="bordered"
                    as="a"
                    href="mailto:cj@sowork.ai?subject=Marketing%20OS%20升級方案"
                    startContent={<Mail size={12} />}
                    className="font-medium"
                  >
                    {p.cta}
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 bg-default-50 border-t border-default-100 flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-default-500 leading-relaxed">
              💡 試用期間每天 LLM 成本上限 $5 USD（保護你不會誤超支）。需要更高用量請聯絡客服升級。
            </p>
            <Button variant="light" onPress={onClose} size="sm">關閉</Button>
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
