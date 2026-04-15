import { useState } from "react";
import { useNavigate } from "react-router-dom";

const EyeIcon = ({ open }: { open: boolean }) => open ? (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
) : (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

export default function Login() {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const isValidFormat = apiKey.length === 0 || apiKey.toLowerCase().startsWith("sw-");
  const isReady = apiKey.length > 10 && isValidFormat;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isReady) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json() as { token?: string; userId?: number; error?: string };
      if (!res.ok) {
        setError(data.error ?? "登入失敗，請確認 API Key 是否正確");
        return;
      }
      localStorage.setItem("authToken", data.token!);
      localStorage.setItem("userId", String(data.userId));
      if ((data as any).email) localStorage.setItem("userEmail", (data as any).email);
      navigate("/");
    } catch {
      setError("網路錯誤，請稍後重試");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: "linear-gradient(135deg, #f8f7ff 0%, #f0eeff 100%)" }}>
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-center px-16 w-1/2" style={{ background: "linear-gradient(160deg, #6C5CE7 0%, #a29bfe 100%)" }}>
        <div className="text-white">
          <div className="text-4xl font-bold mb-3">Marketing OS</div>
          <div className="text-xl opacity-80 mb-8">AI 驅動的行銷作戰指揮台</div>
          <ul className="space-y-4 text-sm opacity-90">
            <li className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs">✦</span>
              多 Agent 並行執行，3 倍行銷產出效率
            </li>
            <li className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs">✦</span>
              Facebook、LinkedIn、YouTube 全渠道整合
            </li>
            <li className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs">✦</span>
              A2A 架構，策略到執行一氣呵成
            </li>
          </ul>
        </div>
      </div>

      {/* Right login panel */}
      <div className="flex flex-col justify-center items-center w-full lg:w-1/2 px-8">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-10 w-full max-w-md">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">歡迎回來</h1>
            <p className="text-gray-400 text-sm">使用您的 API Key 登入 Marketing OS</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                API Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sw-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className={`w-full border rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 transition-colors ${
                    !isValidFormat
                      ? "border-red-300 focus:ring-red-400"
                      : "border-gray-200 focus:ring-indigo-400 focus:border-indigo-400"
                  }`}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  <EyeIcon open={showKey} />
                </button>
              </div>
              {!isValidFormat && (
                <p className="mt-1 text-xs text-red-500">API Key 格式不正確，應以 sw- 開頭</p>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                <span>⚠</span> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !isReady}
              className="w-full rounded-lg py-2.5 text-sm font-semibold transition-all duration-200"
              style={{
                background: isReady && !loading ? "linear-gradient(90deg, #6C5CE7, #a29bfe)" : "#d1cbf8",
                color: "white",
                cursor: isReady && !loading ? "pointer" : "not-allowed",
                boxShadow: isReady && !loading ? "0 4px 12px rgba(108,92,231,0.35)" : "none",
              }}
            >
              {loading ? "登入中..." : "登入"}
            </button>

            <p className="text-center text-xs text-gray-400">
              還沒有 API Key？
              <a href="mailto:support@sowork.ai" className="text-indigo-500 hover:text-indigo-700 ml-1 underline">
                聯絡我們取得
              </a>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
