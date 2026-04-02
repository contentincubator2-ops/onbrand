/**
 * ChatInput — Message input with Enter to send, Shift+Enter for newline.
 * Auto-expands textarea up to 5 rows.
 */
import { useState, useRef, type KeyboardEvent } from "react";

interface Props {
  onSend: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function ChatInput({ onSend, placeholder = "輸入訊息…", disabled }: Props) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
    if (ref.current) ref.current.style.height = "auto";
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  const onInput = () => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = Math.min(ref.current.scrollHeight, 120) + "px";
  };

  return (
    <div className="flex items-end gap-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-2xl px-4 py-3 shadow-sm focus-within:border-[#FF6B35]/50 focus-within:shadow-[0_0_0_3px_rgba(255,107,53,0.08)] transition-all">
      <textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={onKey}
        onInput={onInput}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 resize-none bg-transparent outline-none text-sm text-gray-800 dark:text-white placeholder-gray-400 leading-relaxed"
      />
      <button
        onClick={submit}
        disabled={!value.trim() || disabled}
        className="w-9 h-9 rounded-xl bg-[#FF6B35] text-white flex items-center justify-center disabled:opacity-30 hover:bg-[#e85a28] active:scale-95 transition-all flex-shrink-0"
        aria-label="Send"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 rotate-90">
          <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
        </svg>
      </button>
    </div>
  );
}
