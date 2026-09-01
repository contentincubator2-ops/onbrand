import { describe, expect, it, vi } from "vitest";
import { publicProcedure, router, singleFlightPerUser, type TRPCContext } from "./trpc";

const CONFLICT_MESSAGE = "這個企劃還在產生中，完成後才能再開一個。";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createHarness(maxConcurrent?: number) {
  let currentTime = 1_000;
  const invocations: Array<ReturnType<typeof deferred<string>>> = [];
  const guard = singleFlightPerUser(
    {
      key: "test.singleFlight",
      message: CONFLICT_MESSAGE,
      ttlMs: 100,
      ...(maxConcurrent === undefined ? {} : { maxConcurrent }),
    },
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

  it("admits the first maxConcurrent calls and rejects the next one", async () => {
    const harness = createHarness(3);
    const caller = harness.caller(123);
    const admitted = [caller.guarded(), caller.guarded(), caller.guarded()];
    await waitForInvocations(harness.invocations, 3);

    await expect(caller.guarded()).rejects.toMatchObject({
      code: "CONFLICT",
      message: CONFLICT_MESSAGE,
    });

    admitted.forEach((_, index) => harness.invocations[index].resolve(`call ${index}`));
    await expect(Promise.all(admitted)).resolves.toEqual(["call 0", "call 1", "call 2"]);
  });

  it("releases exactly one slot when any admitted call completes", async () => {
    const harness = createHarness(3);
    const caller = harness.caller(123);
    const admitted = [caller.guarded(), caller.guarded(), caller.guarded()];
    await waitForInvocations(harness.invocations, 3);

    harness.invocations[1].resolve("second");
    await expect(admitted[1]).resolves.toBe("second");
    const replacement = caller.guarded();
    await waitForInvocations(harness.invocations, 4);
    await expect(caller.guarded()).rejects.toMatchObject({ code: "CONFLICT" });

    harness.invocations[0].resolve("first");
    harness.invocations[2].resolve("third");
    harness.invocations[3].resolve("replacement");
    await expect(Promise.all([admitted[0], admitted[2], replacement])).resolves.toEqual([
      "first",
      "third",
      "replacement",
    ]);
  });

  it("releases one slot when an admitted call throws", async () => {
    const harness = createHarness(2);
    const caller = harness.caller(123);
    const failed = caller.guarded();
    const live = caller.guarded();
    await waitForInvocations(harness.invocations, 2);

    harness.invocations[0].reject(new Error("provider failed"));
    await expect(failed).rejects.toThrow("provider failed");
    const replacement = caller.guarded();
    await waitForInvocations(harness.invocations, 3);
    await expect(caller.guarded()).rejects.toMatchObject({ code: "CONFLICT" });

    harness.invocations[1].resolve("live");
    harness.invocations[2].resolve("replacement");
    await expect(Promise.all([live, replacement])).resolves.toEqual(["live", "replacement"]);
  });

  it("prunes stale slots individually while retaining live slots", async () => {
    const harness = createHarness(2);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const caller = harness.caller(123);
    const stale = caller.guarded();
    await waitForInvocations(harness.invocations, 1);
    harness.advance(50);
    const live = caller.guarded();
    await waitForInvocations(harness.invocations, 2);

    harness.advance(50);
    const replacement = caller.guarded();
    await waitForInvocations(harness.invocations, 3);
    expect(warn).toHaveBeenCalledWith(
      "[singleFlight] expired stale slot for test.singleFlight for user 123; elapsedMs=100",
    );
    expect(warn).toHaveBeenCalledTimes(1);
    await expect(caller.guarded()).rejects.toMatchObject({ code: "CONFLICT" });

    harness.invocations[0].resolve("stale");
    harness.invocations[1].resolve("live");
    harness.invocations[2].resolve("replacement");
    await expect(Promise.all([stale, live, replacement])).resolves.toEqual([
      "stale",
      "live",
      "replacement",
    ]);
    warn.mockRestore();
  });

  it("does not let a stale call release a replacement in a multi-slot bucket", async () => {
    const harness = createHarness(2);
    const caller = harness.caller(123);
    const stale = caller.guarded();
    await waitForInvocations(harness.invocations, 1);
    harness.advance(50);
    const live = caller.guarded();
    await waitForInvocations(harness.invocations, 2);

    harness.advance(50);
    const replacement = caller.guarded();
    await waitForInvocations(harness.invocations, 3);
    harness.invocations[0].resolve("stale");
    await expect(stale).resolves.toBe("stale");
    await expect(caller.guarded()).rejects.toMatchObject({ code: "CONFLICT" });

    harness.invocations[1].resolve("live");
    harness.invocations[2].resolve("replacement");
    await expect(Promise.all([live, replacement])).resolves.toEqual(["live", "replacement"]);
  });

  it("refills all maxConcurrent slots after every prior slot becomes stale", async () => {
    const harness = createHarness(3);
    const caller = harness.caller(123);
    const stale = [caller.guarded(), caller.guarded(), caller.guarded()];
    await waitForInvocations(harness.invocations, 3);

    harness.advance(100);
    const replacements = [caller.guarded(), caller.guarded(), caller.guarded()];
    await waitForInvocations(harness.invocations, 6);
    await expect(caller.guarded()).rejects.toMatchObject({ code: "CONFLICT" });

    stale.forEach((_, index) => harness.invocations[index].resolve(`stale ${index}`));
    await expect(Promise.all(stale)).resolves.toEqual(["stale 0", "stale 1", "stale 2"]);
    await expect(caller.guarded()).rejects.toMatchObject({ code: "CONFLICT" });

    replacements.forEach((_, index) => harness.invocations[index + 3].resolve(`new ${index}`));
    await expect(Promise.all(replacements)).resolves.toEqual(["new 0", "new 1", "new 2"]);
  });

  it.each([0, 1.5, Number.NaN])(
    "rejects invalid maxConcurrent value %s",
    (maxConcurrent) => {
      expect(() => createHarness(maxConcurrent)).toThrowError(
        new RangeError("single-flight maxConcurrent must be a positive integer"),
      );
    },
  );
});
