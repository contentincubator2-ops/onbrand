/**
 * TaglineBar — inline-editable 標語 / 副標語 strip
 *
 * Displayed directly above the ChatInput. Two fields:
 *   - tagline     (主標語 / slogan)
 *   - subTagline  (副標語 / sub-slogan)
 *
 * Behaviour:
 *   - Click to edit, blur to save
 *   - Shows placeholder when empty
 *   - Calls onUpdate(tagline, subTagline) with the new values only when changed
 *
 * AppShell is responsible for persisting via trpc.mission.update and re-passing
 * the saved values back down as props.
 */
import React, { useEffect, useRef, useState } from "react";

interface Props {
  missionId: number | null;
  tagline: string | null | undefined;
  subTagline: string | null | undefined;
  onUpdate: (tagline: string | null, subTagline: string | null) => void | Promise<void>;
  disabled?: boolean;
}

export default function TaglineBar({ missionId, tagline, subTagline, onUpdate, disabled }: Props) {
  const [localTagline, setLocalTagline] = useState(tagline ?? "");
  const [localSub, setLocalSub] = useState(subTagline ?? "");
  const [saving, setSaving] = useState(false);
  const initialRef = useRef({ tagline: tagline ?? "", sub: subTagline ?? "" });

  // Sync incoming prop changes (e.g. mission switch, server refetch)
  useEffect(() => {
    setLocalTagline(tagline ?? "");
    initialRef.current.tagline = tagline ?? "";
  }, [tagline, missionId]);
  useEffect(() => {
    setLocalSub(subTagline ?? "");
    initialRef.current.sub = subTagline ?? "";
  }, [subTagline, missionId]);

  const commit = async () => {
    if (!missionId) return;
    const t = localTagline.trim();
    const s = localSub.trim();
    if (t === initialRef.current.tagline && s === initialRef.current.sub) return;
    setSaving(true);
    try {
      await onUpdate(t.length ? t : null, s.length ? s : null);
      initialRef.current = { tagline: t, sub: s };
    } finally {
      setSaving(false);
    }
  };

  const common =
    "w-full bg-transparent outline-none text-[#3d3530] placeholder-[#b8b0a8] focus:bg-white/60 rounded-md px-2 py-1 transition-colors";

  return (
    <div
      className="flex flex-col gap-1 px-3 py-2 mb-2 bg-gradient-to-r from-[#fbf7f1] to-[#f6efe4] border border-[#e5ddd0] rounded-xl"
      aria-label="品牌定位標語"
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-[#9a8f82] flex-shrink-0 w-14">標語</span>
        <input
          type="text"
          value={localTagline}
          onChange={(e) => setLocalTagline(e.target.value.slice(0, 255))}
          onBlur={commit}
          placeholder="點擊新增品牌定位標語..."
          disabled={disabled || !missionId}
          maxLength={255}
          className={`${common} text-sm font-medium`}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-[#9a8f82] flex-shrink-0 w-14">副標語</span>
        <input
          type="text"
          value={localSub}
          onChange={(e) => setLocalSub(e.target.value.slice(0, 255))}
          onBlur={commit}
          placeholder="點擊新增副標語..."
          disabled={disabled || !missionId}
          maxLength={255}
          className={`${common} text-xs`}
        />
        {saving && <span className="text-[10px] text-[#c9823a] flex-shrink-0">儲存中...</span>}
      </div>
    </div>
  );
}
