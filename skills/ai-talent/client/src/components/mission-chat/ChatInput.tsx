/**
 * ChatInput — Sprint 3
 * Message input with Enter to send, Shift+Enter for newline.
 * Auto-expands textarea up to 5 rows.
 * Claude-style warm design with amber send button.
 */
import React, { useState, useRef, type KeyboardEvent } from "react";

interface Props {
  onSend: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Fired once per typing session when the user types an '@' character.
   *  Used by AppShell to bump the "協作成員" section to the top of the right panel. */
  onAtMention?: () => void;
}

export default function ChatInput({ onSend, placeholder = "告訴我你想為「SoWork.ai」完成什麼任務...", disabled, onAtMention }: Props) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const atFiredRef = useRef(false);

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
    atFiredRef.current = false;
    if (ref.current) ref.current.style.height = "auto";
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setValue(next);
    // Fire onAtMention once per session when '@' first appears
    if (!atFiredRef.current && next.includes("@") && onAtMention) {
      atFiredRef.current = true;
      onAtMention();
    } else if (!next.includes("@")) {
      atFiredRef.current = false;
    }
  };

  const onInput = () => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = Math.min(ref.current.scrollHeight, 120) + "px";
  };

  return (
    <div className="flex items-end gap-3 bg-white border border-[#e0dbd5] rounded-2xl px-4 py-3 shadow-sm focus-within:border-[#c9823a]/50 focus-within:shadow-[0_0_0_3px_rgba(201,130,58,0.08)] transition-all">
      <textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={handleChange}
        onKeyDown={onKey}
        onInput={onInput}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 resize-none bg-transparent outline-none text-sm text-[#3d3530] placeholder-[#b8b0a8] leading-relaxed"
      />
      <button
        onClick={submit}
        disabled={!value.trim() || disabled}
        className="w-9 h-9 rounded-xl bg-[#c9823a] text-white flex items-center justify-center disabled:opacity-30 hover:bg-[#b87332] active:scale-95 transition-all flex-shrink-0"
        aria-label="Send"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 rotate-90">
          <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
        </svg>
      </button>
    </div>
  );
}
