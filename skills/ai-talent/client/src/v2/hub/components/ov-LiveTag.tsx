import React from "react";
import { DemoTag, LiveDot, Pill, fmt } from "../ui";

/** Red LIVE marker for real booth interactions (is_demo = 0). */
export function LiveTag({ count, title }: { count?: number; title?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={title ?? "Real interaction, not demo data"}>
      <LiveDot />
      <Pill tone="live">
        LIVE{count != null ? <span className="tabular-nums"> · {fmt(count)}</span> : null}
      </Pill>
    </span>
  );
}

/** Synthetic rows get "Demo data", real rows get LIVE. */
export function SourceTag({ isDemo }: { isDemo: boolean }) {
  return isDemo ? <DemoTag /> : <LiveTag />;
}
