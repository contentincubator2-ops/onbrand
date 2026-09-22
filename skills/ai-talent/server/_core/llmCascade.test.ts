import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// llm.ts snapshots keys from ./env at import time, so the mock has to stand in
// for the whole module.
vi.mock("./env", () => ({
  ENV: {
    OPENAI_API_KEY: "test-openai-key",
    ANTHROPIC_API_KEY: "test-anthropic-key",
    QWEN_API_KEY: "test-qwen-key",
    OPENAI_MODEL: "gpt-4.1-mini",
  },
}));

import { invokeLLM } from "./llm";
import { reset, snapshot, shouldAttempt, recordOutcome } from "./llmCircuitBreaker";

const anthropicReply = (text: string) => new Response(JSON.stringify({
  content: [{ type: "text", text }],
}), { status: 200, headers: { "content-type": "application/json" } });

const messages = [{ role: "user" as const, content: "hi" }];

describe("LLM cascade: one dead provider must not cost the whole task", () => {
  beforeEach(() => {
    reset();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); reset(); });

  // 2026-09-21 (CJ「修 LLM cascade」): before this, no provider fetch had a
  // timeout — a vendor that accepted the connection and then hung held the task
  // until its own budget died. The cascade could not rescue anything because it
  // never got the turn back.
  it("abandons a hung provider and answers from the next one", async () => {
    // The deadline is read per call, so no module reset is needed — and a reset
    // here would give llm.ts its own copy of the breaker module, which is not
    // the one these tests inspect.
    vi.stubEnv("LLM_ATTEMPT_TIMEOUT_MS", "60");

    let hungSignalAborted = false;
    const fetchMock = vi.fn(async (url: any, init: any) => {
      if (String(url).includes("api.openai.com")) {
        // Hang until the attempt deadline aborts us, the way a wedged vendor does.
        return await new Promise<Response>((_resolve, reject) => {
          init.signal.addEventListener("abort", () => {
            hungSignalAborted = true;
            reject(new Error("The operation was aborted"));
          });
        });
      }
      return anthropicReply("rescued");
    });
    vi.stubGlobal("fetch", fetchMock);

    const started = Date.now();
    const out = await invokeLLM({ provider: "openai", messages } as any);

    expect(out.choices?.[0]?.message?.content).toBe("rescued");
    expect(hungSignalAborted).toBe(true);
    // The hung attempt cost roughly the 60ms deadline, not an open-ended wait.
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  // A dead vendor used to be re-probed every 30s forever. Billing and key
  // errors cannot heal on their own, so they earn the 1h circuit.
  it("opens the circuit for an hour on a billing failure, then stops calling it", async () => {
    const fetchMock = vi.fn(async (url: any) => {
      if (String(url).includes("api.openai.com")) {
        return new Response(JSON.stringify({
          error: { message: "Your credit balance is too low to access the API" },
        }), { status: 400, headers: { "content-type": "application/json" } });
      }
      return anthropicReply("from anthropic");
    });
    vi.stubGlobal("fetch", fetchMock);

    await invokeLLM({ provider: "openai", messages } as any);
    const openai = snapshot().find((row) => row.provider === "openai");
    expect(openai?.state).toBe("OPEN");

    // Second call must not touch OpenAI at all.
    fetchMock.mockClear();
    const out = await invokeLLM({ provider: "openai", messages } as any);
    expect(out.choices?.[0]?.message?.content).toBe("from anthropic");
    const calledHosts = fetchMock.mock.calls.map(([url]) => String(url));
    expect(calledHosts.some((u) => u.includes("api.openai.com"))).toBe(false);
  });

  // Measured on prod 2026-09-21: DashScope reports an account-level block as a
  // 400, so the breaker kept re-probing it every 30s — seven times in one 99s
  // task. A 400 that says "access denied" is not a bad request.
  it("treats qwen's account block as permanent even though it arrives as a 400", async () => {
    const fetchMock = vi.fn(async (url: any) => {
      if (String(url).includes("dashscope")) {
        return new Response(JSON.stringify({
          error: { message: "Access denied, please make sure your account is in good standing." },
        }), { status: 400, headers: { "content-type": "application/json" } });
      }
      return anthropicReply("ok");
    });
    vi.stubGlobal("fetch", fetchMock);

    await invokeLLM({ provider: "qwen", messages } as any);

    expect(snapshot().find((row) => row.provider === "qwen")?.state).toBe("OPEN");
    // 30s later a normal cooloff would let a probe through; the permanent one
    // must not.
    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(31_000);
      expect(shouldAttempt("qwen")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still cascades a transient 429 without opening the hour-long circuit", async () => {
    const fetchMock = vi.fn(async (url: any) => {
      if (String(url).includes("api.openai.com")) {
        return new Response(JSON.stringify({ error: { message: "Rate limit reached" } }), {
          status: 429, headers: { "content-type": "application/json" },
        });
      }
      return anthropicReply("ok");
    });
    vi.stubGlobal("fetch", fetchMock);

    await invokeLLM({ provider: "openai", messages } as any);

    // One 429 is not enough to trip the rolling window, so the provider stays
    // eligible — that is the point of separating transient from permanent.
    expect(shouldAttempt("openai")).toBe(true);
  });

  it("reports failed attempts and breaker skips as separate numbers", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Force the breaker OPEN for openai so it is skipped, not attempted. It has
    // to be PINNED too: the default chain starts with anthropic, which would
    // answer before the cascade ever reached openai.
    for (let i = 0; i < 8; i++) recordOutcome("openai", false);
    const fetchMock = vi.fn(async () => anthropicReply("ok"));
    vi.stubGlobal("fetch", fetchMock);

    await invokeLLM({ provider: "openai", messages } as any);

    const summary = warn.mock.calls.map((args) => String(args[0])).find((line) => line.includes("succeeded with"));
    expect(summary).toContain("0 failed attempt(s)");
    expect(summary).toContain("1 skipped by breaker");
  });
});

describe("circuit breaker recovery", () => {
  beforeEach(() => { reset(); vi.spyOn(console, "warn").mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); reset(); });

  // 2026-09-21: a HALF_OPEN probe whose outcome was never recorded (orchestra
  // cut the variant, worker died, client gave up) used to wedge the provider
  // off for the life of the process.
  it("lets a new probe through when the previous one never reported back", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 8; i++) recordOutcome("qwen", false);
    expect(shouldAttempt("qwen")).toBe(false);          // OPEN, cooling off

    vi.advanceTimersByTime(30_001);
    expect(shouldAttempt("qwen")).toBe(true);           // HALF_OPEN probe allowed
    expect(shouldAttempt("qwen")).toBe(false);          // only one at a time

    // …and the probe never settles.
    vi.advanceTimersByTime(60_001);
    expect(shouldAttempt("qwen")).toBe(true);
  });

  it("closes on a successful probe", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 8; i++) recordOutcome("gemini", false);
    vi.advanceTimersByTime(30_001);
    expect(shouldAttempt("gemini")).toBe(true);
    recordOutcome("gemini", true);
    expect(snapshot().find((r) => r.provider === "gemini")?.state).toBe("CLOSED");
  });
});
