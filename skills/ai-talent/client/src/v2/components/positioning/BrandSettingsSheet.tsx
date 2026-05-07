/**
 * BrandSettingsSheet — right-side drawer for brand setup tasks that
 * shouldn't crowd the main 3-tile workspace.
 *
 * CJ direction (2026-05-07, Path A simplification):
 *   "我偏好 A，可以完全移除指令區。社群帳號連結放在設定。"
 *
 * Tabs (vertical):
 *   - 基本資料 (name / industry / description)
 *   - 連結 (website + social URLs — uses existing ConnectorEditor)
 *   - 視覺 (logo upload + colors — placeholder, full editor later)
 *   - AI 指令庫 (per-platform overrides — uses existing AIPromptsEditor)
 *   - 危險區 (delete brand)
 *
 * Opens via the gear icon top-right of Brand workspace header.
 */
import { useState } from "react";
import { Modal, ModalContent, Button } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLink, faPalette, faRobot, faTrash, faIdCard, faXmark } from "@fortawesome/free-solid-svg-icons";
import ConnectorEditor from "./ConnectorEditor";
import AIPromptsEditor from "./AIPromptsEditor";

type SettingsTab = "info" | "connector" | "visual" | "ai" | "danger";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  brandId: number | null;
  brandName: string | null;
}

const TABS: Array<{ id: SettingsTab; label: string; icon: any }> = [
  { id: "info",      label: "基本資料",  icon: faIdCard  },
  { id: "connector", label: "連結",      icon: faLink    },
  { id: "visual",    label: "視覺",      icon: faPalette },
  { id: "ai",        label: "AI 指令",   icon: faRobot   },
  { id: "danger",    label: "危險區",    icon: faTrash   },
];

export default function BrandSettingsSheet({ isOpen, onClose, brandId, brandName }: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("connector");

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      placement="top"
      size="5xl"
      scrollBehavior="inside"
      backdrop="blur"
      classNames={{
        base: "max-h-[90vh] my-4",
        body: "p-0",
      }}
    >
      <ModalContent>
        <div className="flex" style={{ minHeight: "70vh" }}>
          {/* Left rail — vertical tabs */}
          <div className="w-44 shrink-0 border-r border-default-100 bg-default-50/40 flex flex-col">
            <div className="px-4 py-4 border-b border-default-100">
              <div className="text-tiny text-default-500 font-medium uppercase tracking-wider">設定</div>
              <div className="text-sm font-semibold text-default-900 truncate mt-0.5" title={brandName ?? ""}>{brandName ?? "—"}</div>
            </div>
            <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition text-left ${
                    activeTab === t.id
                      ? "bg-default-900 text-white"
                      : "text-default-700 hover:bg-default-100"
                  }`}
                >
                  <FontAwesomeIcon
                    icon={t.icon}
                    className="text-tiny shrink-0"
                    style={{ width: 14 }}
                  />
                  <span>{t.label}</span>
                </button>
              ))}
            </nav>
            <div className="px-2 py-3 border-t border-default-100">
              <Button variant="light" size="sm" onPress={onClose} startContent={<FontAwesomeIcon icon={faXmark} className="text-tiny" />} className="w-full justify-start">
                關閉
              </Button>
            </div>
          </div>

          {/* Right pane — active tab */}
          <div className="flex-1 min-w-0 overflow-y-auto">
            {activeTab === "info" && <InfoTab brandId={brandId} brandName={brandName} />}
            {activeTab === "connector" && (
              <ConnectorEditor brandId={brandId} />
            )}
            {activeTab === "visual" && <VisualTab brandId={brandId} />}
            {activeTab === "ai" && (
              <AIPromptsEditor brandId={brandId} />
            )}
            {activeTab === "danger" && <DangerTab brandId={brandId} brandName={brandName} onClose={onClose} />}
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}

function InfoTab({ brandId, brandName }: { brandId: number | null; brandName: string | null }) {
  return (
    <div className="max-w-[700px] mx-auto p-8">
      <h2 className="text-2xl font-semibold text-default-900 mb-2">基本資料</h2>
      <p className="text-sm text-default-500 mb-6">名稱 / 產業 / 描述</p>
      <div className="bg-default-50 rounded-xl p-5 text-sm text-default-700 leading-relaxed">
        <div className="mb-2"><span className="text-default-500">名稱：</span>{brandName ?? "—"}</div>
        <div className="text-default-400 italic">產業 / 描述編輯介面接下來會接上（用 brand.update mutation）</div>
        <div className="text-default-400 italic mt-1">brandId: {brandId}</div>
      </div>
    </div>
  );
}

function VisualTab({ brandId }: { brandId: number | null }) {
  return (
    <div className="max-w-[800px] mx-auto p-8">
      <h2 className="text-2xl font-semibold text-default-900 mb-2">視覺識別</h2>
      <p className="text-sm text-default-500 mb-6">Logo · 色票 · 字型 · 識別規範</p>
      <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 text-sm text-default-700 leading-relaxed">
        <div className="font-medium text-orange-700 mb-1.5">🚧 開發中</div>
        Logo 上傳、色票挑選器、字型設定 — 接下來會在此 tab 內完整實作。目前若要設定 Logo，請先到 brand.update 設定 logoUrl 欄位，或等下一輪。
        <div className="text-default-400 italic mt-2">brandId: {brandId}</div>
      </div>
    </div>
  );
}

function DangerTab({ brandId, brandName, onClose }: { brandId: number | null; brandName: string | null; onClose: () => void }) {
  return (
    <div className="max-w-[700px] mx-auto p-8">
      <h2 className="text-2xl font-semibold text-default-900 mb-2">危險區</h2>
      <p className="text-sm text-default-500 mb-6">不可逆操作 — 慎用</p>
      <div className="border-2 border-danger-300 rounded-xl p-5 bg-danger-50">
        <h3 className="font-semibold text-danger-800 mb-1.5">刪除品牌</h3>
        <p className="text-sm text-default-700 mb-4">
          這會永久刪除「{brandName ?? brandId}」及其所有定位 / 文字 / 視覺 / 知識資料。對應的產品、活動會變成孤兒。**此動作不可復原**。
        </p>
        <Button color="danger" variant="bordered" isDisabled>
          刪除（接下來會接上）
        </Button>
      </div>
    </div>
  );
}
