/**
 * Unit tests for kbLimits.ts (Issue #20)
 *
 * Covers:
 *   - getSoftLimitBytes / getHardLimitBytes env-config
 *   - soft limit warning at 80%
 *   - hard limit rejection (PAYLOAD_TOO_LARGE)
 *   - admin override bypasses hard limit + emits audit log
 *   - no error when under all thresholds
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";

// ── Shared state shared across mocks ─────────────────────────────────────────

let mockBytesUsed = 0;
let mockAdminOverride = false;
const sessionLogEvents: unknown[] = [];

// ── Mock: DB ─────────────────────────────────────────────────────────────────

const mockDb: any = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockImplementation(function (this: any) {
    // Return override row or usage row depending on which table is queried
    return Promise.resolve([{ total: mockBytesUsed, adminKbOverride: mockAdminOverride, lastComputedAt: new Date() }]);
  }),
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      onDuplicateKeyUpdate: vi.fn().mockResolvedValue([{ insertId: 1 }]),
    }),
  }),
};

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
}));

vi.mock("../drizzle/schema", () => ({
  missionKnowledgeFiles: { brandId: "brandId", fileSize: "fileSize" },
  brandKbUsage: { brandId: "brandId", bytesUsed: "bytesUsed", lastComputedAt: "lastComputedAt" },
  brandKbAdminOverride: { brandId: "brandId", adminKbOverride: "adminKbOverride" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: unknown, _val: unknown) => ({ col: _col, val: _val })),
  sum: vi.fn((col: unknown) => col),
}));

vi.mock("./_core/sessionLogger", () => ({
  logEvent: vi.fn((params: unknown) => {
    sessionLogEvents.push(params);
  }),
  newSessionId: vi.fn(() => "test-session-id"),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

// We import lazily inside tests because env vars must be set before the
// module resolves its constants in some code paths.
async function importKbLimits() {
  return import("./kbLimits");
}

// ─────────────────────────────────────────────────────────────────────────────

describe("kbLimits — env-configurable limits", () => {
  it("getSoftLimitBytes returns 100 MB by default", async () => {
    delete process.env.KB_SOFT_LIMIT_MB;
    const { getSoftLimitBytes } = await importKbLimits();
    expect(getSoftLimitBytes()).toBe(100 * 1024 * 1024);
  });

  it("getSoftLimitBytes respects KB_SOFT_LIMIT_MB env var", async () => {
    process.env.KB_SOFT_LIMIT_MB = "200";
    const { getSoftLimitBytes } = await importKbLimits();
    expect(getSoftLimitBytes()).toBe(200 * 1024 * 1024);
    delete process.env.KB_SOFT_LIMIT_MB;
  });

  it("getHardLimitBytes returns 500 MB by default", async () => {
    delete process.env.KB_HARD_LIMIT_MB;
    const { getHardLimitBytes } = await importKbLimits();
    expect(getHardLimitBytes()).toBe(500 * 1024 * 1024);
  });

  it("getHardLimitBytes respects KB_HARD_LIMIT_MB env var", async () => {
    process.env.KB_HARD_LIMIT_MB = "1000";
    const { getHardLimitBytes } = await importKbLimits();
    expect(getHardLimitBytes()).toBe(1000 * 1024 * 1024);
    delete process.env.KB_HARD_LIMIT_MB;
  });

  it("getWarningThresholdBytes is 80% of soft limit", async () => {
    delete process.env.KB_SOFT_LIMIT_MB;
    const { getWarningThresholdBytes, getSoftLimitBytes } = await importKbLimits();
    expect(getWarningThresholdBytes()).toBe(Math.floor(getSoftLimitBytes() * 0.8));
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("checkKbUploadAllowed", () => {
  const MB = 1024 * 1024;
  const SOFT_MB = 100;
  const HARD_MB = 500;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionLogEvents.length = 0;
    mockAdminOverride = false;
    delete process.env.KB_SOFT_LIMIT_MB;
    delete process.env.KB_HARD_LIMIT_MB;

    // Default: return 0 bytes used, no override
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.where.mockResolvedValue([{ total: mockBytesUsed, adminKbOverride: false }]);
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onDuplicateKeyUpdate: vi.fn().mockResolvedValue([]),
      }),
    });
  });

  it("allows upload when well under all limits", async () => {
    mockBytesUsed = 10 * MB;
    mockDb.where
      .mockResolvedValueOnce([{ total: mockBytesUsed }])  // recomputeKbUsage SUM
      .mockResolvedValueOnce([{ adminKbOverride: false }]); // isAdminOverrideEnabled

    const { checkKbUploadAllowed } = await importKbLimits();
    const result = await checkKbUploadAllowed(mockDb, {
      brandId: 1,
      userId: 42,
      incomingBytes: 5 * MB,
    });

    expect(result.overrideActive).toBe(false);
    expect(result.bytesUsed).toBe(mockBytesUsed);
  });

  it("emits 80% warning when projected usage crosses warn threshold", async () => {
    // 79 MB already used; 2 MB upload → 81 MB > 80% of 100 MB
    const currentBytes = 79 * MB;
    mockBytesUsed = currentBytes;
    mockDb.where
      .mockResolvedValueOnce([{ total: currentBytes }])
      .mockResolvedValueOnce([{ adminKbOverride: false }]);

    const { checkKbUploadAllowed } = await importKbLimits();
    const { logEvent } = await import("./_core/sessionLogger");

    await checkKbUploadAllowed(mockDb, {
      brandId: 1,
      userId: 42,
      incomingBytes: 2 * MB,
    });

    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          event: "kb_soft_limit_80pct_warning",
          brandId: 1,
        }),
      })
    );
  });

  it("throws PAYLOAD_TOO_LARGE when upload would exceed hard limit", async () => {
    // 490 MB used; 20 MB incoming → 510 MB > 500 MB hard limit
    const currentBytes = 490 * MB;
    mockBytesUsed = currentBytes;
    mockDb.where
      .mockResolvedValueOnce([{ total: currentBytes }])
      .mockResolvedValueOnce([{ adminKbOverride: false }]);

    const { checkKbUploadAllowed } = await importKbLimits();

    await expect(
      checkKbUploadAllowed(mockDb, {
        brandId: 1,
        userId: 42,
        incomingBytes: 20 * MB,
      })
    ).rejects.toThrow(
      expect.objectContaining({
        code: "PAYLOAD_TOO_LARGE",
      })
    );
  });

  it("throws TRPCError with code PAYLOAD_TOO_LARGE (not generic Error)", async () => {
    const currentBytes = 490 * MB;
    mockBytesUsed = currentBytes;
    mockDb.where
      .mockResolvedValueOnce([{ total: currentBytes }])
      .mockResolvedValueOnce([{ adminKbOverride: false }]);

    const { checkKbUploadAllowed } = await importKbLimits();

    try {
      await checkKbUploadAllowed(mockDb, { brandId: 1, userId: 1, incomingBytes: 20 * MB });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe("PAYLOAD_TOO_LARGE");
    }
  });

  it("admin override bypasses hard limit and emits audit log", async () => {
    // 490 MB + 20 MB would normally exceed 500 MB hard limit
    const currentBytes = 490 * MB;
    mockBytesUsed = currentBytes;
    mockAdminOverride = true;
    mockDb.where
      .mockResolvedValueOnce([{ total: currentBytes }])
      .mockResolvedValueOnce([{ adminKbOverride: true }]);

    const { checkKbUploadAllowed } = await importKbLimits();
    const { logEvent } = await import("./_core/sessionLogger");

    const result = await checkKbUploadAllowed(mockDb, {
      brandId: 1,
      userId: 99,
      incomingBytes: 20 * MB,
    });

    expect(result.overrideActive).toBe(true);
    // Should NOT throw — override is active
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          event: "kb_hard_limit_bypassed_by_admin_override",
          brandId: 1,
        }),
      })
    );
  });

  it("admin override also emits 80% warning if applicable", async () => {
    const currentBytes = 85 * MB;  // 85 MB > 80% of 100 MB soft
    mockBytesUsed = currentBytes;
    mockAdminOverride = true;
    mockDb.where
      .mockResolvedValueOnce([{ total: currentBytes }])
      .mockResolvedValueOnce([{ adminKbOverride: true }]);

    const { checkKbUploadAllowed } = await importKbLimits();
    const { logEvent } = await import("./_core/sessionLogger");

    await checkKbUploadAllowed(mockDb, { brandId: 2, userId: 1, incomingBytes: 1 * MB });

    const events = (logEvent as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    const auditLog = events.find((e: any) => e.metadata?.event === "kb_hard_limit_bypassed_by_admin_override");
    const warning = events.find((e: any) => e.metadata?.event === "kb_soft_limit_80pct_warning");

    expect(auditLog).toBeDefined();
    expect(warning).toBeDefined();
  });
});
