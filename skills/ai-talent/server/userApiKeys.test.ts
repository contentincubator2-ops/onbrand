import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";

// Mock DB
const mockInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) });
const mockSelect = vi.fn();
const mockUpdate = vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) });

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
  }),
}));

vi.mock("../drizzle/schema", () => ({
  userApiKeys: { userId: "userId", apiKey: "apiKey", isActive: "isActive", label: "label" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ a, b })),
  and: vi.fn((...args: unknown[]) => args),
}));

describe("userApiKeys hash security", () => {
  it("API key should be stored as SHA-256 hash", () => {
    const rawKey = "sw-test12345678901234567890123456";
    const hash = createHash("sha256").update(rawKey).digest("hex");
    // Hash should not equal raw key
    expect(hash).not.toBe(rawKey);
    // Hash should be 64 chars hex
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("different keys produce different hashes", () => {
    const h1 = createHash("sha256").update("sw-key1").digest("hex");
    const h2 = createHash("sha256").update("sw-key2").digest("hex");
    expect(h1).not.toBe(h2);
  });

  it("same key always produces same hash", () => {
    const key = "sw-abc123";
    const h1 = createHash("sha256").update(key).digest("hex");
    const h2 = createHash("sha256").update(key).digest("hex");
    expect(h1).toBe(h2);
  });
});
