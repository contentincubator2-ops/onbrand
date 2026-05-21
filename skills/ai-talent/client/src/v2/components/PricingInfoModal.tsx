/**
 * PricingInfoModal — informational pricing card shown inside the app.
 * 2026-05-19. Aligned with PricingPage: Trial → Starter → Solo → Studio → Agency.
 * Task counting = per execution run (not per variant/image).
 */
import { Modal, ModalContent, ModalBody, Button } from "@heroui/react";
import { Sparkles, Mail, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { useLang } from "../../lib/i18n";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

function getPlans(lang: "zh-TW" | "en") {
  const en = lang === "en";
  return [
    {
      name: en ? "Trial" : "試用",
      price: en ? "Free" : "免費",
      badge: en ? "Now" : "現在",
      detail: en ? "7 days · 1,000 pts" : "7 天 · 1,000 點",
      features: en ? [
        "All 30s / 60s task templates",
        "Brand positioning pipeline",
        "AI images + mockup previews",
        "Ends when 7 days OR 1,000 pts run out",
      ] : [
        "30s / 60s 全任務模板",
        "品牌定位 14 步驟流程",
        "AI 圖 + 全平台預覽",
        "7 天到期或 1,000 點用完即停",
      ],
      cta: null as string | null,
      highlight: true,
    },
    {
      name: "OnBrand Starter",
      price: en ? "US$25 / mo" : "NT$750 / 月",
      badge: en ? "Early bird" : "早鳥",
      detail: en ? "50 runs / mo · 1 brand · annual US$300 ($25×12)" : "每月 50 次執行 · 1 品牌 · 年約 NT$7,500（×10，送 2 個月）",
      features: en ? [
        "50 runs / mo (1 run = all variants + images)",
        "30s & 60s templates · brand brain",
        "FB / IG publish + schedule",
        "E-invoices · cancel anytime",
        "99s deep-research: Solo only",
      ] : [
        "每月 50 次執行（1 次含所有版本 + 圖）",
        "30s / 60s 模板 · 品牌大腦",
        "FB / IG 發布 + 排程",
        "電子發票 · 隨時取消",
        "99s 深度研究：需升級 Solo",
      ],
      cta: en ? "See pricing" : "查看定價",
      highlight: false,
    },
    {
      name: "OnBrand Solo",
      price: en ? "US$100 / mo" : "NT$3,000 / 月",
      badge: en ? "Popular" : "熱門",
      detail: en ? "Unlimited runs · 1 brand" : "無限次執行 · 1 品牌 · 年約 NT$30,000（×10，送 2 個月）",
      features: en ? [
        "Unlimited runs — 30s / 60s / 99s",
        "Unlimited AI images",
        "99s deep-research pipeline",
        "FB / IG publish + schedule",
        "E-invoices · cancel anytime",
      ] : [
        "無限次執行 — 30s / 60s / 99s 全開",
        "無限 AI 圖",
        "99s 深度研究流程",
        "FB / IG 發布 + 排程",
        "電子發票 · 隨時取消",
      ],
      cta: en ? "See pricing" : "查看定價",
      highlight: false,
    },
  ];
}

export default function PricingInfoModal({ isOpen, onClose }: Props) {
  const { lang } = useLang();
  const PLANS = getPlans(lang);
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
              <span className="text-xs font-semibold uppercase tracking-widest opacity-90">
                {lang === "en" ? "Plans & pricing" : "方案和定價"}
              </span>
            </div>
            <h1 className="text-2xl font-semibold">
              {lang === "en" ? "Find the right plan" : "選擇適合你的方案"}
            </h1>
            {balance && (
              <p className="text-sm opacity-90 mt-1">
                {lang === "en" ? "You have " : "你目前還有 "}
                <span className="font-bold">{(balance as any)?.totalAvailable ?? 0}</span>
                {lang === "en" ? " trial points remaining" : " 試用點數剩餘"}
              </p>
            )}
            <p className="text-xs opacity-75 mt-2">
              {lang === "en"
                ? "⭐ Early-bird prices — locked forever for accounts opened now"
                : "⭐ 早鳥優惠 — 現在開通即永久保價"}
            </p>
          </div>

          {/* Plans grid */}
          <div className="grid gap-3 p-5 sm:grid-cols-3">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={`rounded-2xl border p-4 flex flex-col ${
                  p.highlight
                    ? "border-violet-300 bg-violet-50/40 ring-2 ring-violet-200"
                    : "border-default-200 bg-white"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold text-default-900">{p.name}</span>
                  {p.badge && (
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                      style={{ background: p.highlight ? "#7C3AED" : "#059669" }}
                    >
                      {p.badge}
                    </span>
                  )}
                </div>
                <div className="text-lg font-semibold text-default-900 mb-0.5">{p.price}</div>
                <div className="text-xs text-default-500 mb-3 leading-snug">{p.detail}</div>
                <ul className="text-xs text-default-700 space-y-1.5 mb-4 flex-1">
                  {p.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className={`mt-0.5 ${p.highlight ? "text-violet-500" : "text-emerald-500"}`}>✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {p.cta && (
                  <Button
                    size="sm"
                    color="primary"
                    variant="bordered"
                    as={Link}
                    to="/pricing"
                    onPress={onClose}
                    startContent={<ExternalLink size={12} />}
                    className="font-medium"
                  >
                    {p.cta}
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Task counting note */}
          <div className="px-5 py-3 bg-amber-50 border-t border-amber-100">
            <p className="text-xs text-amber-800 leading-relaxed">
              {lang === "en"
                ? "💡 One run = one task execution, including all variants + images. System failures are automatically refunded."
                : "💡 一次執行 = 跑一次任務，包含所有版本 + 圖片，系統錯誤自動退回不計次數。"}
            </p>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 bg-default-50 border-t border-default-100 flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-default-500 leading-relaxed">
              {lang === "en"
                ? "Trial plans include a $5/day AI usage limit to prevent accidental overages. Paid plans: $50/day."
                : "試用期每日 LLM 成本上限 $5 USD（防止誤超支）。付費方案：每日 $50 USD。"}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="bordered"
                as="a"
                href="mailto:sowork@sowork.ai?subject=OnBrand 方案升級"
                startContent={<Mail size={12} />}
                className="font-medium"
              >
                {lang === "en" ? "Contact support" : "聯絡客服"}
              </Button>
              <Button variant="light" onPress={onClose} size="sm">
                {lang === "en" ? "Close" : "關閉"}
              </Button>
            </div>
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
