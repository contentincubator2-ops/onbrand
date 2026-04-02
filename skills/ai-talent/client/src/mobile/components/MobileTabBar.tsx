/**
 * 底部 5 個 Tab 導航列
 * 設計：聯絡人 → 聊天 → 幕僚長(中間突出) → 任務 → 我的
 * 注意：此元件在 Router base="/app" 下，路徑使用相對路徑
 */
import { useLocation } from "wouter";
import { useI18n } from "@/i18n";

interface TabItem {
  id: string;
  path: string;
  labelKey: string;
  isCenter?: boolean;
  icon: (active: boolean) => JSX.Element;
}

// Apple SF Symbols 風格色彩
const ICON_ACTIVE = "#1C1C1E";   // Apple 系統黑
const ICON_INACTIVE = "#8E8E93"; // Apple 系統灰
const LABEL_ACTIVE = "#1C1C1E";
const LABEL_INACTIVE = "#8E8E93";

const tabs: TabItem[] = [
  {
    id: "contacts",
    path: "/contacts",
    labelKey: "tabs.contacts",
    icon: (active) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? ICON_ACTIVE : ICON_INACTIVE} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    id: "chat",
    path: "/chat",
    labelKey: "tabs.chat",
    icon: (active) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? ICON_ACTIVE : ICON_INACTIVE} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    id: "assistant",
    path: "/assistant",
    labelKey: "tabs.assistant",
    isCenter: true,
    icon: (active) => (
      // 幕僚長 Icon - 填充人像剪影 + 星星徽章 (Apple SF Symbols 風格)
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        {/* 人像剪影 - 填充 */}
        <circle cx="12" cy="8" r="4" fill={active ? "#FFFFFF" : "#FFFFFF"} />
        <path d="M4 20c0-4 4-6 8-6s8 2 8 6" fill={active ? "#FFFFFF" : "#FFFFFF"} />
        {/* 星星徽章 */}
        <path d="M19 2l.5 1.5L21 4l-1.5.5L19 6l-.5-1.5L17 4l1.5-.5L19 2z" fill={active ? "#FFFFFF" : "#FFFFFF"} />
      </svg>
    ),
  },
  {
    id: "tasks",
    path: "/tasks",
    labelKey: "tabs.tasks",
    icon: (active) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? ICON_ACTIVE : ICON_INACTIVE} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    id: "calendar",
    path: "/calendar",
    labelKey: "tabs.calendar",
    icon: (active) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? ICON_ACTIVE : ICON_INACTIVE} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /><path d="M8 14h.01M12 14h.01M16 14h.01" />
      </svg>
    ),
  },
];

export default function MobileTabBar() {
  const [location, navigate] = useLocation();
  const { t } = useI18n();

  const activeTab = tabs.find((tab) => location === tab.path || location.startsWith(tab.path + "/"))?.id ?? "chat";

  return (
    <nav
      className="flex-shrink-0 bg-white border-t border-gray-200 relative"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-center justify-around h-14">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          
          // 中間的「幕僚長」按鈕特殊樣式 - Apple 風格黑色
          if (tab.isCenter) {
            return (
              <button
                key={tab.id}
                onClick={() => navigate(tab.path)}
                className="flex flex-col items-center justify-center flex-1 h-full relative"
              >
                {/* 突出的圓形按鈕 - Apple 黑色風格 */}
                <div 
                  className="absolute -top-5 w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95"
                  style={{ 
                    background: isActive 
                      ? "#1C1C1E"  // Apple 系統黑
                      : "#3C3C43", // Apple 深灰
                  }}
                >
                  {tab.icon(isActive)}
                </div>
                <span
                  className="text-[10px] font-medium leading-none mt-7"
                  style={{ color: isActive ? LABEL_ACTIVE : LABEL_INACTIVE }}
                >
                  {t(tab.labelKey)}
                </span>
              </button>
            );
          }
          
          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-opacity active:opacity-60"
            >
              {tab.icon(isActive)}
              <span
                className="text-[10px] font-medium leading-none"
                style={{ color: isActive ? LABEL_ACTIVE : LABEL_INACTIVE }}
              >
                {t(tab.labelKey)}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
