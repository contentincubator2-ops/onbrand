import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runWithCancel, throwIfCancelled, isRunCancelled, CancelledError, isCancelledError,
  registerRun, cancelRunByKey, markRunDelivered, _resetRunRegistry,
} from "./runCancel";
import { cancelRunAndRefund } from "../billing/cancelRefund";

describe("runCancel scope", () => {
  it("is a no-op outside a run", () => {
    expect(isRunCancelled()).toBe(false);
    expect(() => throwIfCancelled()).not.toThrow();
  });

  it("a cancelled run stops before the next provider call", async () => {
    const controller = new AbortController();
    const providerCall = vi.fn(async () => "ok");
    const callProvider = async () => { throwIfCancelled(); return providerCall(); };

    await expect(runWithCancel(controller.signal, async () => {
      await callProvider();          // call 1 happens
      controller.abort();            // user cancels mid-run
      await callProvider();          // call 2 must not reach the provider
      await callProvider();
    })).rejects.toBeInstanceOf(CancelledError);
    expect(providerCall).toHaveBeenCalledTimes(1);
  });

  it("scope survives async boundaries and is isolated per run", async () => {
    const a = new AbortController();
    const b = new AbortController();
    a.abort();
    const [ra, rb] = await Promise.all([
      runWithCancel(a.signal, async () => { await new Promise((r) => setTimeout(r, 5)); return isRunCancelled(); }),
      runWithCancel(b.signal, async () => { await new Promise((r) => setTimeout(r, 5)); return isRunCancelled(); }),
    ]);
    expect(ra).toBe(true);
    expect(rb).toBe(false);
    expect(isCancelledError(new CancelledError())).toBe(true);
    expect(isCancelledError(new Error("x"))).toBe(false);
  });
});

describe("cancel registry + refund", () => {
  beforeEach(() => _resetRunRegistry());
  const deps = () => ({
    isUnlimited: vi.fn(async () => false),
    refund: vi.fn(async () => {}),
  });

  it("refunds once when nothing was delivered", async () => {
    const c = registerRun("run-key-0001", 7, { action: "task_60s", points: 60 });
    const d = deps();
    const r = await cancelRunAndRefund("run-key-0001", 7, d);
    expect(c.signal.aborted).toBe(true);
    expect(r).toEqual({ cancelled: true, refundedPoints: 60 });
    expect(d.refund).toHaveBeenCalledWith(7, 60, "cancel_refund:task_60s");
    const again = await cancelRunAndRefund("run-key-0001", 7, d);
    expect(again.refundedPoints).toBe(0);
    expect(d.refund).toHaveBeenCalledTimes(1);
  });

  it("does not refund after output was delivered", async () => {
    registerRun("run-key-0002", 7, { action: "task_30s", points: 30 });
    markRunDelivered("run-key-0002");
    const d = deps();
    expect(await cancelRunAndRefund("run-key-0002", 7, d)).toEqual({ cancelled: true, refundedPoints: 0 });
    expect(d.refund).not.toHaveBeenCalled();
  });

  it("another user cannot cancel the run", () => {
    const c = registerRun("run-key-0003", 7, null);
    expect(cancelRunByKey("run-key-0003", 8)).toEqual({ found: false });
    expect(c.signal.aborted).toBe(false);
  });

  it("never refunds unlimited wallets", async () => {
    registerRun("run-key-0004", 7, { action: "task_99s", points: 99 });
    const d = deps();
    d.isUnlimited.mockResolvedValue(true);
    expect(await cancelRunAndRefund("run-key-0004", 7, d)).toEqual({ cancelled: true, refundedPoints: 0 });
    expect(d.refund).not.toHaveBeenCalled();
  });

  it("unknown key is a harmless no-op", async () => {
    expect(await cancelRunAndRefund("nope-nope-nope", 7, deps())).toEqual({ cancelled: false, refundedPoints: 0 });
  });
});

describe("callLLM honours cancellation", () => {
  it("issues no provider request when the run is already cancelled", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    const { callLLM } = await import("./llmRouter");
    const controller = new AbortController();
    controller.abort();
    await expect(runWithCancel(controller.signal, () => callLLM({ system: "s", user: "u" })))
      .rejects.toBeInstanceOf(CancelledError);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
