import { describe, expect, it, vi } from "vitest";
import { publicProcedure, router, singleFlightPerUser, type TRPCContext } from "./trpc";

const CONFLICT_MESSAGE = "這個企劃還在產生中，完成後才能再開一個。";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createHarness() {
  let currentTime = 1_000;
  const invocations: Array<ReturnType<typeof deferred<string>>> = [];
  const guard = singleFlightPerUser(
    { key: "test.singleFlight", message: CONFLICT_MESSAGE, ttlMs: 100 },
    { now: () => currentTime },
  );
  const testRouter = router({
    guarded: publicProcedure.use(guard).query(() => {
      const call = deferred<string>();
      invocations.push(call);
      return call.promise;
    }),
  });

  return {
    caller(userId: number | null) {
      const context: TRPCContext = { user: userId === null ? null : { id: userId } };
      return testRouter.createCaller(context);
    },
    invocations,
    advance(ms: number) {
      currentTime += ms;
    },
  };
}

async function waitForInvocations(invocations: unknown[], count: number) {
  await vi.waitFor(() => expect(invocations).toHaveLength(count));
}

describe("singleFlightPerUser", () => {
  it("rejects a concurrent call from the same user with the existing conflict", async () => {
    const harness = createHarness();
    const caller = harness.caller(123);
    const first = caller.guarded();
    await waitForInvocations(harness.invocations, 1);

    await expect(caller.guarded()).rejects.toMatchObject({
      code: "CONFLICT",
      message: CONFLICT_MESSAGE,
    });

    harness.invocations[0].resolve("first");
    await expect(first).resolves.toBe("first");
  });

  it("lets a new call replace a slot once its TTL has elapsed", async () => {
    const harness = createHarness();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const caller = harness.caller(123);
    const stale = caller.guarded();
    await waitForInvocations(harness.invocations, 1);

    harness.advance(100);
    const replacement = caller.guarded();
    await waitForInvocations(harness.invocations, 2);
    expect(warn).toHaveBeenCalledWith(
      "[singleFlight] expired stale slot for test.singleFlight for user 123; elapsedMs=100",
    );

    harness.invocations[1].resolve("replacement");
    harness.invocations[0].resolve("stale");
    await expect(replacement).resolves.toBe("replacement");
    await expect(stale).resolves.toBe("stale");
    warn.mockRestore();
  });

  it("does not let a stale call's finally delete its replacement slot", async () => {
    const harness = createHarness();
    const caller = harness.caller(123);
    const stale = caller.guarded();
    await waitForInvocations(harness.invocations, 1);

    harness.advance(100);
    const replacement = caller.guarded();
    await waitForInvocations(harness.invocations, 2);

    harness.invocations[0].resolve("stale");
    await expect(stale).resolves.toBe("stale");
    await expect(caller.guarded()).rejects.toMatchObject({
      code: "CONFLICT",
      message: CONFLICT_MESSAGE,
    });

    harness.invocations[1].resolve("replacement");
    await expect(replacement).resolves.toBe("replacement");
  });

  it("keeps slots independent between users", async () => {
    const harness = createHarness();
    const firstUser = harness.caller(123).guarded();
    const secondUser = harness.caller(456).guarded();
    await waitForInvocations(harness.invocations, 2);

    harness.invocations[0].resolve("first user");
    harness.invocations[1].resolve("second user");
    await expect(firstUser).resolves.toBe("first user");
    await expect(secondUser).resolves.toBe("second user");
  });

  it("does not reserve a slot for an unauthenticated call", async () => {
    const harness = createHarness();
    const firstUnauthenticated = harness.caller(null).guarded();
    const secondUnauthenticated = harness.caller(null).guarded();
    const authenticated = harness.caller(123).guarded();
    await waitForInvocations(harness.invocations, 3);

    harness.invocations[0].resolve("first unauthenticated");
    harness.invocations[1].resolve("second unauthenticated");
    harness.invocations[2].resolve("authenticated");
    await expect(firstUnauthenticated).resolves.toBe("first unauthenticated");
    await expect(secondUnauthenticated).resolves.toBe("second unauthenticated");
    await expect(authenticated).resolves.toBe("authenticated");
  });
});
