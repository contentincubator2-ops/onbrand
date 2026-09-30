import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * 2026-09-30：`trpc.x.y.useQuery?.(input, opts)` 會被編譯成
 * `useQuery.call(this, input, opts)`，而 tRPC 的 proxy 把結尾的 `.call`
 * 當特例，只留第一個參數 —— opts（enabled / refetchInterval / staleTime…）
 * 全被丟掉，沒有任何錯誤。實例：PlatformTaskPage 的 campaign.get 帶
 * eventId:0 照樣發出去，吐「載入失敗：campaign.get — 參數錯誤」。
 * proxy 上的 hook 永遠是函式，`?.(` 本來就沒有保護作用，一律直接呼叫。
 */
const ROOT = join(__dirname, "..");
const BAD = /\.(useQuery|useInfiniteQuery|useSuspenseQuery)\?\.\(/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

describe("tRPC query hooks are never optional-called", () => {
  it("no `.useQuery?.(` in client source (it silently drops the options argument)", () => {
    const hits = walk(ROOT)
      .flatMap((p) => readFileSync(p, "utf8").split("\n").map((l, i) => [p, i + 1, l] as const))
      .filter(([, , l]) => BAD.test(l))
      .map(([p, i]) => `${p.slice(ROOT.length + 1)}:${i}`);
    expect(hits).toEqual([]);
  });
});
