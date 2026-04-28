/**
 * ForkPromptBar — sticky bottom bar that surfaces when the user has
 * dirty edits to the applied methodology.
 *
 * Two actions:
 *   "捨棄變更" → reset to original (parent calls reset)
 *   "存成新任務範本" → opens an inline name prompt → calls
 *                    methodology.fork → updates mission's squadSlug.
 *
 * Hermes-style: every customization becomes its own first-class
 * methodology that can be re-applied to other missions.
 */
import React, { useState } from "react";

export default function ForkPromptBar({
  dirtyCount,
  defaultName,
  onDiscard,
  onFork,
}: {
  dirtyCount: number;
  defaultName: string;
  onDiscard: () => void;
  onFork: (newName: string) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-x-0 bottom-0 z-30">
      <div className="max-w-[1280px] mx-auto px-8 pb-5">
        <div className="bg-foreground text-white shadow-lift flex items-center gap-4 px-6 py-4">
          <div className="flex-1 min-w-0">
            <div className="text-tiny tracking-[0.28em] uppercase text-white/60">
              METHODOLOGY DIRTY
            </div>
            <div className="text-small truncate">
              你已調整 {dirtyCount} 處 — 要把這份新版本存成自己的任務範本嗎？
            </div>
          </div>

          {!editing && (
            <>
              <button
                onClick={onDiscard}
                className="px-3 py-1.5 text-tiny tracking-[0.16em] uppercase text-white/70 hover:text-white"
              >
                捨棄變更
              </button>
              <button
                onClick={() => setEditing(true)}
                className="px-4 py-2 text-tiny tracking-[0.18em] uppercase bg-white text-foreground hover:bg-white/90"
              >
                存成新任務範本 →
              </button>
            </>
          )}

          {editing && (
            <div className="flex items-center gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="新任務範本名稱"
                className="bg-foreground/90 border border-white/30 text-white px-3 py-2 text-small focus:outline-none focus:border-white w-[280px]"
                disabled={busy}
              />
              <button
                onClick={async () => {
                  if (!name.trim()) return;
                  setBusy(true);
                  try { await onFork(name.trim()); }
                  finally { setBusy(false); setEditing(false); }
                }}
                disabled={busy || !name.trim()}
                className="px-4 py-2 text-tiny tracking-[0.18em] uppercase bg-white text-foreground disabled:opacity-50"
              >
                {busy ? "儲存中…" : "確認"}
              </button>
              <button
                onClick={() => setEditing(false)}
                disabled={busy}
                className="px-3 py-2 text-tiny tracking-[0.16em] uppercase text-white/60 hover:text-white"
              >
                取消
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
