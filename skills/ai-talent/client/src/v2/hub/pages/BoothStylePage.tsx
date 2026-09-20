/**
 * BoothStylePage — 展場訪客貼「一篇自己寫過、自己喜歡的文章」的地方。
 *
 * 2026-09-19 (CJ「用戶可以輸入自己篇好的人設參考文章風格後，開始發文章」)。
 *
 * 為什麼不在聊天室裡收：手機上貼八百字會被切成好幾則、會斷行，bot 還可能把
 * 第二則當成新問題。一個單欄位的頁面穩得多，而且訪客已經在手機上了，點一下
 * 就開。
 *
 * 刻意沒有登入：網址裡那串 token 就是身分，Hermes 才剛在對話裡發給他。
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

interface Info {
  found: boolean;
  company?: string | null;
  displayName?: string | null;
  submitted?: boolean;
}

const MIN_CHARS = 80;

export default function BoothStylePage() {
  const { token } = useParams();
  const [info, setInfo] = useState<Info | null>(null);
  const [sample, setSample] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/booth/style/${token}`)
      .then((r) => r.json())
      .then((d: Info) => {
        if (cancelled) return;
        setInfo(d);
        if (d.submitted) setState("done");
      })
      .catch(() => !cancelled && setInfo({ found: false }));
    return () => { cancelled = true; };
  }, [token]);

  const submit = async () => {
    setState("saving");
    setError("");
    try {
      const res = await fetch(`/api/booth/style/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sample: sample.trim() }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Couldn't save that.");
      setState("done");
    } catch (e: any) {
      setError(e?.message ?? "Couldn't save that.");
      setState("error");
    }
  };

  if (info === null) {
    return <Shell><p className="text-neutral-500">Loading…</p></Shell>;
  }

  if (!info.found) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-neutral-900">This link has expired</h1>
        <p className="mt-2 text-neutral-600">
          Go back to the chat and ask for a new one.
        </p>
      </Shell>
    );
  }

  if (state === "done") {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-neutral-900">Got it</h1>
        <p className="mt-2 text-neutral-600">
          I'm working out how you write — sentence length, how you open, where you put the call to action.
          Head back to the chat; I'll send your first post there.
        </p>
      </Shell>
    );
  }

  const short = sample.trim().length < MIN_CHARS;

  return (
    <Shell>
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-orange-600">
        {info.company ?? "Your brand"}
      </p>
      <h1 className="mt-1.5 text-xl font-semibold text-neutral-900">
        Paste one post you've written
      </h1>
      <p className="mt-2 text-[14px] leading-relaxed text-neutral-600">
        One you actually liked — not a description of what you want. I measure the real thing:
        how long your sentences run, how you open, whether you ask questions, where the link goes.
      </p>

      <label htmlFor="booth-sample" className="sr-only">Your post</label>
      <textarea
        id="booth-sample"
        value={sample}
        onChange={(e) => setSample(e.target.value)}
        rows={12}
        autoFocus
        placeholder="Paste it here…"
        className="mt-4 w-full resize-y rounded-lg border border-neutral-300 p-3 text-[15px] leading-relaxed
                   text-neutral-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
      />

      <div className="mt-2 flex items-center justify-between text-[12px] text-neutral-500">
        <span>{sample.trim().length} characters</span>
        {short && sample.length > 0 ? <span>A bit more, please</span> : null}
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={short || state === "saving"}
        className="mt-4 w-full rounded-lg px-4 py-3 text-[15px] font-semibold text-white disabled:opacity-50"
        style={{ background: "#F97316" }}
      >
        {state === "saving" ? "Saving…" : "That's how I write"}
      </button>

      <p className="mt-4 text-[12px] leading-relaxed text-neutral-500">
        This is a trial account created for you at the booth. It keeps your brand, your products and this
        sample for 7 days.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "rgb(252,251,254)" }} className="min-h-screen">
      <div className="mx-auto max-w-[620px] px-5 py-10">{children}</div>
    </div>
  );
}
