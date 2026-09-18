import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import { verifyLineSignature, textMessages, imageMessages } from "./lineClient";

const SECRET = "f0".repeat(16);
const sign = (body: string, secret = SECRET) =>
  crypto.createHmac("sha256", secret).update(Buffer.from(body, "utf8")).digest("base64");

describe("verifyLineSignature", () => {
  const prev = process.env.LINE_CHANNEL_SECRET;
  beforeEach(() => { process.env.LINE_CHANNEL_SECRET = SECRET; });
  afterEach(() => {
    if (prev === undefined) delete process.env.LINE_CHANNEL_SECRET;
    else process.env.LINE_CHANNEL_SECRET = prev;
  });

  it("accepts a signature made from the exact raw bytes", () => {
    const body = '{"events":[{"type":"message"}]}';
    expect(verifyLineSignature(Buffer.from(body, "utf8"), sign(body))).toBe(true);
  });

  it("rejects when a single byte of the body differs", () => {
    const body = '{"events":[{"type":"message"}]}';
    const tampered = '{"events":[{"type":"messagE"}]}';
    expect(verifyLineSignature(Buffer.from(tampered, "utf8"), sign(body))).toBe(false);
  });

  it("rejects a signature made with a different channel secret", () => {
    const body = '{"a":1}';
    expect(verifyLineSignature(Buffer.from(body, "utf8"), sign(body, "someone-elses-secret"))).toBe(false);
  });

  it("rejects a missing or malformed signature header rather than throwing", () => {
    const b = Buffer.from("{}", "utf8");
    expect(verifyLineSignature(b, undefined)).toBe(false);
    expect(verifyLineSignature(b, "")).toBe(false);
    expect(verifyLineSignature(b, "not-base64-!!!")).toBe(false);
  });

  it("rejects everything when no channel secret is configured", () => {
    delete process.env.LINE_CHANNEL_SECRET;
    const body = "{}";
    expect(verifyLineSignature(Buffer.from(body, "utf8"), sign(body))).toBe(false);
  });

  it("is sensitive to whitespace — this is why the raw buffer must not be re-serialised", () => {
    const body = '{"a":1}';
    const reserialised = '{"a": 1}'; // what JSON.parse → JSON.stringify can produce
    expect(verifyLineSignature(Buffer.from(reserialised, "utf8"), sign(body))).toBe(false);
  });
});

describe("textMessages", () => {
  it("returns nothing for blank text (LINE rejects an empty message)", () => {
    expect(textMessages("")).toEqual([]);
    expect(textMessages("   ")).toEqual([]);
  });

  it("keeps a normal caption as one message", () => {
    const out = textMessages("孩子問『爸爸，為什麼路邊有香？』");
    expect(out).toHaveLength(1);
    expect(out[0]!.type).toBe("text");
  });

  it("splits past the per-message limit and never exceeds 5 parts", () => {
    const out = textMessages("字".repeat(40000));
    expect(out.length).toBeGreaterThan(1);
    expect(out.length).toBeLessThanOrEqual(5);
    for (const m of out) expect(m.text.length).toBeLessThanOrEqual(5000);
  });
});

describe("imageMessages", () => {
  it("drops failed images (null url) instead of sending a broken message", () => {
    expect(imageMessages([null, undefined])).toEqual([]);
  });

  it("drops non-https urls — LINE fetches the image server-side and requires https", () => {
    expect(imageMessages(["http://example.com/a.png", "/static/covers/b.png"])).toEqual([]);
  });

  it("keeps https urls and uses the same url for the preview", () => {
    const out = imageMessages(["https://onbrand.sowork.ai/static/covers/a.png"]);
    expect(out).toHaveLength(1);
    expect(out[0]!.originalContentUrl).toBe(out[0]!.previewImageUrl);
  });
});
