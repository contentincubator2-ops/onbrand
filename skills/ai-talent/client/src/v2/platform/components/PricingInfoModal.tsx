/**
 * PricingInfoModal — informational pricing card shown inside the app.
 * 2026-09-07 對齊 Word 價目表：試用 → 基礎（2 席）→ 專業（5 席）。數字與 PricingPage 同源。
 * 兩級差在能力不在用量（執行次數都不限）。
 */
import { CATALOG } from "../lib/catalogFigures";
import { Modal, ModalContent, ModalBody, Button } from "@heroui/react";
import { ExternalIcon, GenerateIcon, MailIcon, CheckIcon } from "./icons";
import { Link } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";

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
        "Single & pack task cards",
        "Brand positioning",
        "AI images + platform previews",
        "Ends when 7 days OR 1,000 pts run out",
      ] : [
        "單篇與套組任務卡",
        "品牌定位",
        "AI 圖 + 全平台預覽",
        "7 天到期或 1,000 點用完即停",
      ],
      cta: null as string | null,
      highlight: false,
    },
    {
      name: en ? "onBrand Studio Basic" : "onBrand Studio 基礎版",
      price: en ? "US$75 / mo" : "NT$2,250 / 月",
      badge: en ? "2 seats" : "2 席",
      detail: en ? `1 brand · pick 2 of ${CATALOG.channels} channels (swap monthly)` : `1 個品牌 · ${CATALOG.channels} 個通路選 2（每月可更換）`,
      features: en ? [
        "Brand positioning · 3 own task cards",
        "Task cards: the ones you build for your brand",
        "Unlimited runs · campaign tasks included",
        "Performance layer: early preview (simulated data)",
      ] : [
        "品牌定位 · 自建任務卡 3 張",
        "任務卡：你替品牌自建的卡",
        "執行次數不限 · 企劃任務開放",
        "成效層：早期預覽（模擬數據）",
      ],
      cta: en ? "See pricing" : "查看定價",
      highlight: false,
    },
    {
      name: en ? "onBrand Studio Professional" : "onBrand Studio 專業版",
      price: en ? "US$300 / mo" : "NT$9,000 / 月",
      badge: en ? "5 seats" : "5 席",
      detail: en ? `1 brand · pick 5 of ${CATALOG.channels} channels (swap monthly)` : `1 個品牌 · ${CATALOG.channels} 個通路選 5（每月可更換）`,
      features: en ? [
        "Brand + 10 product + monthly campaign positioning · 10 own task cards",
        `Viral-structure cards (refreshed monthly) + your own cards`,
        "Unlimited runs · campaign tasks · review workflow",
        "Strategy monitoring: alerts when your brand, products or competitors shift",
        "Performance: early preview + priority access to real connections",
      ] : [
        "品牌 ＋ 產品 10 個 ＋ 活動每月 1 次定位 · 自建任務卡 10 張",
        `每月更新的爆款結構卡 ＋ 品牌自建卡`,
        "執行次數不限 · 企劃任務開放 · 審核工作流",
        "策略監測：品牌、產品與競爭者有變化時提醒調整",
        "成效層：早期預覽 ＋ 優先加購真實串接",
      ],
      cta: en ? "See pricing" : "查看定價",
      highlight: true,
    },
  ];
}

export default function PricingInfoModal({ isOpen, onClose }: Props) {
  const { lang } = useLang();
  const PLANS = getPlans(lang);
  const balanceQuery = (trpc as any).credits?.getBalance?.useQuery(undefined, {
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
            style={{ background: "#171717" }}
          >
            <div className="flex items-center gap-2 mb-1">
              <GenerateIcon size={16} />
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
                ? "Cancel anytime — keep access until the current period ends"
                : "隨時可取消 — 當期結束前皆可正常使用"}
            </p>
          </div>

          {/* Plans grid */}
          <div className="grid gap-3 p-5 sm:grid-cols-3">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={`rounded-2xl border p-4 flex flex-col ${
                  p.highlight
                    ? "border-neutral-900 bg-white ring-1 ring-neutral-900"
                    : "border-default-200 bg-white"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold text-default-900">{p.name}</span>
                  {p.badge && (
                    <span
                      className="text-[12px] font-bold px-2 py-0.5 rounded-full text-white"
                      style={{ background: "#171717" }}
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
                      <span className="mt-0.5 text-neutral-700"><CheckIcon size={11} /></span>
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
                    startContent={<ExternalIcon size={12} />}
                    className="font-medium"
                  >
                    {p.cta}
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* 兩級差在能力，不在用量 */}
          <div className="px-5 py-3 bg-neutral-50 border-t border-neutral-200">
            <p className="text-xs text-neutral-700 leading-relaxed">
              {lang === "en"
                ? "The two tiers differ in capability, not volume: unlimited runs on both. The difference is channels, viral-structure cards, product and campaign positioning, own task cards, and seats."
                : "兩級的差別在能力，不在用量：執行次數兩級都不限。差別是通路數、爆款結構卡、產品與活動定位、自建卡張數、席次。"}
            </p>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 bg-default-50 border-t border-default-100 flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-default-500 leading-relaxed">
              {lang === "en"
                ? "Every plan has a daily fair-use ceiling on AI cost to prevent accidental overages."
                : "所有方案都有每日合理使用上限，避免誤用超支。"}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="bordered"
                as="a"
                href="mailto:sowork@sowork.ai?subject=onBrand Studio 方案升級"
                startContent={<MailIcon size={12} />}
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
