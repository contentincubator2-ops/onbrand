/**
 * SoWork AI Team — Mobile Web App
 * 主要入口元件，包含 5 個 Tab 導航和 Onboarding 流程
 * 
 * AI Mobile Team 獨立專案 — dev-mobileteam.sowork.ai
 */
import { Switch, Route, Redirect, useLocation } from "wouter";
import { useAuth } from "../_core/hooks/useAuth";

// Mobile Pages
import MobileLandingPage from "./pages/MobileLandingPage";
import MobileDemoPage from "./pages/MobileDemoPage";
import MobileContactsPage from "./pages/MobileContactsPage";
import MobileChatPage from "./pages/MobileChatPage";
import MobileAssistantPage from "./pages/MobileAssistantPage";
import MobileTasksPage from "./pages/MobileTasksPage";
import MobileProfilePage from "./pages/MobileProfilePage";
import MobileOnboarding from "./pages/MobileOnboarding";
import MobileChatDetailPage from "./pages/MobileChatDetailPage";
import MobileGroupDetailPage from "./pages/MobileGroupDetailPage";
import MobileAgentDetailPage from "./pages/MobileAgentDetailPage";
import MobileTaskDetailPage from "./pages/MobileTaskDetailPage";
import MobileTaskExecutionPage from "./pages/MobileTaskExecutionPage";
import MobileCompanySettingsPage from "./pages/MobileCompanySettingsPage";
import MobileGroupChatPage from "./pages/MobileGroupChatPage";
import MobileCreateGroupPage from "./pages/MobileCreateGroupPage";
import MobileContentCalendarPage from "./pages/MobileContentCalendarPage";
import MobileSecurityPage from "./pages/MobileSecurityPage";

// Mobile Components
import MobileTabBar from "./components/MobileTabBar";
import MobileLoginPage from "./pages/MobileLoginPage";
import MobileGroupsPage from "./pages/MobileGroupsPage";

export type MobileTab = "contacts" | "chat" | "tasks" | "groups" | "profile";

export default function MobileApp() {
  const { user, loading } = useAuth();
  const [location] = useLocation();

  // 隱藏 TabBar 的路由（子頁面）— location 是相對於 /app 的路徑
  const hideTabBar =
    location.startsWith("/chat/") ||
    location.startsWith("/group/") ||
    location.startsWith("/agent/") ||
    location.startsWith("/task/") ||
    location === "/onboarding" ||
    location.startsWith("/onboarding") ||
    location === "/task/new" ||
    location === "/company-settings" ||
    location === "/security";

  if (loading) {
    return (
      <div className="mobile-app flex items-center justify-center min-h-screen bg-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">載入中...</p>
        </div>
      </div>
    );
  }

  // 檢查是否使用演示模式（以 demoPersonaId 為準）
  const useDemoMode = typeof window !== "undefined" && !!localStorage.getItem("demoPersonaId");
  
  // 演示頁面路由
  if (location === "/demo") {
    return <MobileDemoPage />;
  }

  // 未登入且非演示模式 → 顯示登入頁
  if (!user && !useDemoMode) {
    return <MobileLoginPage />;
  }

  // 已登入但沒有選擇公司體驗 → 顯示公司選擇頁（登入頁的公司選擇模式）
  if (user && !useDemoMode) {
    return <MobileLoginPage showOnlyCompanySelector />;
  }

  return (
    <div className="mobile-app flex flex-col h-screen bg-gray-50 overflow-hidden">
      {/* 主要內容區 */}
      <div className="flex-1 overflow-hidden">
        <Switch>
          <Route path="/" component={() => <Redirect to="/chat" />} />
          <Route path="/onboarding" component={MobileOnboarding} />
          <Route path="/contacts" component={MobileContactsPage} />
          <Route path="/agent/:agentId" component={MobileAgentDetailPage} />
          <Route path="/chat" component={MobileChatPage} />
          <Route path="/chat/new" component={MobileCreateGroupPage} />
          <Route path="/chat/group/:groupId" component={MobileGroupChatPage} />
          <Route path="/chat/:conversationId" component={MobileChatDetailPage} />
          <Route path="/assistant" component={MobileAssistantPage} />
          <Route path="/tasks" component={MobileTasksPage} />
          <Route path="/task/new" component={MobileTaskExecutionPage} />
          <Route path="/task/:taskId" component={MobileTaskDetailPage} />
          <Route path="/groups" component={MobileGroupsPage} />
          <Route path="/group/:groupId" component={MobileGroupDetailPage} />
          <Route path="/profile" component={MobileProfilePage} />
          <Route path="/company-settings" component={MobileCompanySettingsPage} />
          <Route path="/calendar" component={MobileContentCalendarPage} />
          <Route path="/security" component={MobileSecurityPage} />
          <Route component={() => <Redirect to="/chat" />} />
        </Switch>
      </div>

      {/* 底部 Tab Bar */}
      {!hideTabBar && <MobileTabBar />}
    </div>
  );
}
