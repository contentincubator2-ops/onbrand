/**
 * ScopeSwitchOverlay — appears briefly when user switches brand /
 * product / event in ScopeBar. Visualises "20 agents loading the new
 * scope's positioning + assets" so the switch feels intentional.
 *
 * CJ direction (2026-05-07):
 *   "切換品牌時讓用戶感受到有更換了，例如一個動畫，顯示讀取 xx 定位
 *    書、規範當中。或是 20 個 agent 作為背景，20 個人都滿的時候表示
 *    都讀取完了。"
 *
 * UX: 1.4s reveal, agent dots fill in waves matching the 4 readers
 * (定位 / 文字 / 視覺 / 知識). Auto-dismisses.
 */
import { useEffect, useRef, useState } from "react";

interface Props {
  scopeKey: string | null; // unique per (brandId, productId, eventId) — change triggers overlay
  scopeName: string | null; // e.g. "五感十築"
}

const TOTAL_AGENTS = 20;
const DURATION_MS = 1400;

export default function ScopeSwitchOverlay({ scopeKey, scopeName }: Props) {
  const [visible, setVisible] = useState(false);
  const [filled, setFilled] = useState(0);
  const lastKey = useRef<string | null>(null);
  const rafRef = useRef<any>(null);

  useEffect(() => {
    if (!scopeKey) { setVisible(false); return; }
    if (lastKey.current === null) {
      // Initial mount — record but don't animate (avoid flash on first load)
      lastKey.current = scopeKey;
      return;
    }
    if (lastKey.current === scopeKey) return;
    lastKey.current = scopeKey;

    setVisible(true);
    setFilled(0);
    const startedAt = Date.now();

    const step = () => {
      const elapsed = Date.now() - startedAt;
      const pct = Math.min(1, elapsed / DURATION_MS);
      // Ease-out: agents fill faster at start, slow at end (feels like loading)
      const eased = 1 - Math.pow(1 - pct, 2.4);
      setFilled(Math.round(eased * TOTAL_AGENTS));
      if (pct < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        // Hold full state for a beat, then fade out
        setTimeout(() => setVisible(false), 220);
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [scopeKey]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
      style={{
        background: "rgba(15, 23, 42, 0.55)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        animation: "fadeIn 0.18s ease-out",
      }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes pulse-dot {
          0%, 100% { transform: scale(1); opacity: 1 }
          50% { transform: scale(1.18); opacity: 0.85 }
        }
      `}</style>
      <div className="bg-white rounded-2xl shadow-2xl px-7 py-6 max-w-md mx-4">
        <div className="text-center">
          <div className="text-tiny font-semibold uppercase tracking-widest text-violet-500 mb-1">
            BRAND WORKSPACE
          </div>
          <h2 className="text-lg font-semibold text-default-900 mb-1">
            讀取 {scopeName ?? "品牌"} 定位書中…
          </h2>
          <p className="text-tiny text-default-500 mb-4">
            20 位 agent 正在載入定位 / 文字 / 視覺 / 知識
          </p>

          {/* 20 agent dots in a 5×4 grid */}
          <div className="grid grid-cols-10 gap-1.5 mb-2 mx-auto" style={{ maxWidth: 240 }}>
            {Array.from({ length: TOTAL_AGENTS }).map((_, i) => {
              const isFilled = i < filled;
              return (
                <div
                  key={i}
                  className="rounded-full transition-all"
                  style={{
                    width: 18, height: 18,
                    background: isFilled
                      ? `linear-gradient(135deg, #00b4bc 0%, #7c3aed 100%)`
                      : "#E4E4E7",
                    boxShadow: isFilled ? "0 1px 6px rgba(124,58,237,0.32)" : "none",
                    animation: isFilled ? `pulse-dot 1.2s ease-in-out infinite ${i * 30}ms` : undefined,
                  }}
                />
              );
            })}
          </div>

          <div className="text-tiny text-default-500 tabular-nums">
            {filled} / {TOTAL_AGENTS}
          </div>
        </div>
      </div>
    </div>
  );
}
