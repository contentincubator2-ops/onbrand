/**
 * OnboardingWizard v4 — 建立品牌流程
 * 步驟1：填寫品牌資料 → 呼叫 trpc.brand.createWithMember
 * 步驟2：成功後顯示提示 → 3 秒後跳轉 /?positioning=true&brandId={id}
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../lib/trpc";

interface OnboardingProps {
  onComplete?: (brandId: number, brandName: string) => void;
}

const INDUSTRIES = [
  "請選擇產業",
  "AI / 科技軟體",
  "電商 / 零售",
  "美妝 / 保養",
  "餐飲 / 食品",
  "教育 / 培訓",
  "金融 / 保險",
  "醫療 / 健康",
  "媒體 / 娛樂",
  "製造 / 工業",
  "房地產",
  "旅遊 / 飯店",
  "非營利組織",
  "其他",
];

const COLORS = {
  bg: "#F9F9F8",
  accent: "#E8631A",
  border: "#E4E3E1",
  text: "#1A1A1A",
  muted: "#6B6B6B",
  inputBg: "#FFFFFF",
  success: "#22c55e",
};

export default function OnboardingWizard({ onComplete }: OnboardingProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<"form" | "done">("form");
  const [createdBrand, setCreatedBrand] = useState<{ id: number; name: string } | null>(null);
  const [countdown, setCountdown] = useState(3);

  // Form state
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [socialLinks, setSocialLinks] = useState("");
  const [description, setDescription] = useState("");
  const [industry, setIndustry] = useState("");
  const [error, setError] = useState("");

  const createBrand = trpc.brand.createWithMember.useMutation();

  // Step 2 countdown & redirect
  useEffect(() => {
    if (step !== "done" || !createdBrand) return;
    if (countdown <= 0) {
      navigate(`/?positioning=true&brandId=${createdBrand.id}`);
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [step, countdown, createdBrand, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("品牌名稱為必填"); return; }

    try {
      const result = await createBrand.mutateAsync({
        name: name.trim(),
        website: website.trim() || undefined,
        socialLinks: socialLinks.trim() || undefined,
        description: description.trim() || undefined,
        industry: industry && industry !== "請選擇產業" ? industry : undefined,
      });
      setCreatedBrand({ id: result.id, name: result.name });
      setStep("done");
      onComplete?.(result.id, result.name);
    } catch (err: any) {
      setError(err?.message ?? "建立失敗，請再試一次");
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    border: `1.5px solid ${COLORS.border}`,
    borderRadius: 8,
    background: COLORS.inputBg,
    color: COLORS.text,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.15s",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: COLORS.text,
    marginBottom: 6,
  };

  const fieldStyle: React.CSSProperties = { marginBottom: 18 };

  // ── Step 2: Done ──────────────────────────────────────────────────────────
  if (step === "done" && createdBrand) {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{
          background: "#fff",
          border: `1.5px solid ${COLORS.border}`,
          borderRadius: 16,
          padding: "48px 40px",
          maxWidth: 480,
          width: "100%",
          textAlign: "center",
          boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: COLORS.text, margin: "0 0 12px" }}>
            品牌已建立！
          </h2>
          <p style={{ fontSize: 15, color: COLORS.muted, margin: "0 0 24px", lineHeight: 1.6 }}>
            「{createdBrand.name}」已成功建立。<br />
            正在引導到品牌定位...
          </p>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: COLORS.bg,
            border: `1.5px solid ${COLORS.border}`,
            borderRadius: 100,
            padding: "8px 20px",
            fontSize: 13,
            color: COLORS.muted,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.accent, display: "inline-block", animation: "pulse 1s infinite" }} />
            {countdown} 秒後自動跳轉
          </div>
          <div style={{ marginTop: 20 }}>
            <button
              onClick={() => navigate(`/?positioning=true&brandId=${createdBrand.id}`)}
              style={{
                background: COLORS.accent,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "10px 24px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              立即前往
            </button>
          </div>
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
      </div>
    );
  }

  // ── Step 1: Form ──────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{
        background: "#fff",
        border: `1.5px solid ${COLORS.border}`,
        borderRadius: 16,
        padding: "40px 36px",
        maxWidth: 520,
        width: "100%",
        boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
      }}>
        {/* Header */}
        <div style={{ marginBottom: 28, textAlign: "center" }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: COLORS.bg,
            border: `1.5px solid ${COLORS.border}`,
            borderRadius: 100,
            padding: "6px 14px",
            fontSize: 12,
            color: COLORS.muted,
            marginBottom: 16,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.success, display: "inline-block" }} />
            SoWork Marketing OS
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.text, margin: "0 0 8px" }}>
            建立你的第一個品牌
          </h1>
          <p style={{ fontSize: 13, color: COLORS.muted, margin: 0, lineHeight: 1.6 }}>
            填寫基本資料，AI 團隊將為你展開完整的品牌定位分析
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={fieldStyle}>
            <label style={labelStyle}>
              品牌名稱 <span style={{ color: COLORS.accent }}>*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例如：SoWork AI"
              style={inputStyle}
              autoFocus
              maxLength={128}
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>官網連結 <span style={{ color: COLORS.muted, fontWeight: 400 }}>(選填)</span></label>
            <input
              type="url"
              value={website}
              onChange={e => setWebsite(e.target.value)}
              placeholder="https://www.yoursite.com"
              style={inputStyle}
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>社群連結 <span style={{ color: COLORS.muted, fontWeight: 400 }}>(選填)</span></label>
            <input
              type="text"
              value={socialLinks}
              onChange={e => setSocialLinks(e.target.value)}
              placeholder="Instagram、Facebook、LinkedIn 等連結"
              style={inputStyle}
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>品牌簡介 <span style={{ color: COLORS.muted, fontWeight: 400 }}>(選填)</span></label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="簡單介紹你的品牌、產品或服務..."
              rows={3}
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
              maxLength={500}
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>產業 <span style={{ color: COLORS.muted, fontWeight: 400 }}>(選填)</span></label>
            <select
              value={industry}
              onChange={e => setIndustry(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              {INDUSTRIES.map(ind => (
                <option key={ind} value={ind === "請選擇產業" ? "" : ind}>{ind}</option>
              ))}
            </select>
          </div>

          {error && (
            <div style={{
              background: "#fff5f5",
              border: "1.5px solid #fecaca",
              borderRadius: 8,
              padding: "10px 14px",
              color: "#dc2626",
              fontSize: 13,
              marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={createBrand.isPending || !name.trim()}
            style={{
              width: "100%",
              padding: "12px 24px",
              background: createBrand.isPending || !name.trim() ? "#ccc" : COLORS.accent,
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 700,
              cursor: createBrand.isPending || !name.trim() ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
          >
            {createBrand.isPending ? "建立中..." : "建立並開始品牌定位 →"}
          </button>
        </form>
      </div>
    </div>
  );
}
