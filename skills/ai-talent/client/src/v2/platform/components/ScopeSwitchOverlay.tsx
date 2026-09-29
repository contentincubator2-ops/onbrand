/**
 * ScopeSwitchOverlay — appears briefly when user switches brand /
 * product / event in ScopeBar. Visualises "20 agents loading the new
 * scope's positioning + assets" so the switch feels intentional.
 *
 * CJ direction:
 *   - 2026-05-07: "20 個 agent 作為背景，都滿時表示讀取完成"
 *   - 2026-05-08: "我想要用成 20 個不同 agent 的頭像" (was generic dots)
 *
 * Avatars: 20 deterministic dicebear seeds (notionists style) so the
 * faces are stable across reloads and feel like a fixed team rather
 * than random noise.
 */
import { useEffect, useRef, useState } from "react";

interface Props {
  scopeKey: string | null; // unique per (brandId, productId, eventId) — change triggers overlay
  scopeName: string | null; // e.g. "五感十築"
}

const TOTAL_AGENTS = 20;
const DURATION_MS = 1400;

// 20 deterministic agent seeds — names span fictional team roles so the
// composition feels like a real squad. Notionists style avatars match
// the rest of the product (RunningAgentCarousel etc.).
const AGENT_SEEDS: Array<{ name: string; role: string }> = [
  { name: "Aiden Hsu",      role: "文案寫手" },
  { name: "Mandy Cheng",    role: "Image Director" },
  { name: "Jordan Hayes",   role: "QA Reviewer" },
  { name: "Tina Ji",         role: "Brand Strategist" },
  { name: "Sarah Liu",       role: "CMO" },
  { name: "Vicky Feng",      role: "Live Host" },
  { name: "Iris Liang",      role: "IG Specialist" },
  { name: "Janet Chang",     role: "YT Specialist" },
  { name: "Nina Yeh",        role: "Shorts Editor" },
  { name: "Eric Chen",       role: "Trend Researcher" },
  { name: "Kevin Lin",       role: "Content Strategy" },
  { name: "Yizhen Lai",      role: "Brand Story" },
  { name: "Ryan Yu",         role: "Growth" },
  { name: "Reed Lee",        role: "Insights Storyteller" },
  { name: "Grace Wu",        role: "Brand Storyteller" },
  { name: "Tyler Brooks",    role: "Short-Form" },
  { name: "Emma Zhang",      role: "主題標籤策略師" },
  { name: "Helen Sung",      role: "Reply Writer" },
  { name: "David Wang",      role: "Scheduler" },
  { name: "Sophie Ho",       role: "Followup Writer" },
];

const dicebear = (seed: string) =>
  `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=ede9fe,fce7f3,dbeafe,d1fae5,fef3c7,e0e7ff,fee2e2,e0f2fe&backgroundType=solid`;

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
        setTimeout(() => setVisible(false), 320);
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
        @keyframes avatarPop {
          0%   { transform: scale(0.4); opacity: 0 }
          60%  { transform: scale(1.12); opacity: 1 }
          100% { transform: scale(1); opacity: 1 }
        }
        @keyframes avatarBreathe {
          0%, 100% { transform: scale(1) }
          50% { transform: scale(1.04) }
        }
      `}</style>
      <div className="bg-white rounded-2xl shadow-2xl px-7 py-6 max-w-lg mx-4">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-default-900 mb-4">
            讀取 {scopeName ?? "品牌"} 定位書中…
          </h2>

          {/* 20 agent avatars in a 10×2 grid */}
          <div className="grid grid-cols-10 gap-1.5 mb-3 mx-auto" style={{ maxWidth: 360 }}>
            {AGENT_SEEDS.map((agent, i) => {
              const isFilled = i < filled;
              return (
                <div
                  key={agent.name}
                  className="relative"
                  style={{ width: 30, height: 30 }}
                  title={`${agent.name} · ${agent.role}`}
                >
                  {/* Placeholder background while not yet "loaded" */}
                  {!isFilled && (
                    <div
                      className="absolute inset-0 rounded-full"
                      style={{ background: "#E4E4E7" }}
                    />
                  )}
                  {/* Avatar — pops in when reached */}
                  {isFilled && (
                    <div
                      className="absolute inset-0 rounded-full overflow-hidden"
                      style={{
                        animation: `avatarPop 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards, avatarBreathe 1.6s ease-in-out infinite ${i * 50}ms`,
                        boxShadow: "0 0 0 1.5px #fff, 0 1px 3px rgba(24,24,27,0.18)",
                      }}
                    >
                      <img
                        src={dicebear(agent.name)}
                        alt={agent.name}
                        loading="eager"
                        style={{ width: "100%", height: "100%", display: "block" }}
                      />
                    </div>
                  )}
                </div>
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
