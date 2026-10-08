import { describe, it, expect } from "vitest";
import { parseFfmpegProbe, frameTimestamps } from "./mediaToText";

describe("parseFfmpegProbe", () => {
  it("讀出片長與聲音／畫面", () => {
    const out = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'a.mp4':
  Duration: 00:01:23.45, start: 0.000000, bitrate: 1205 kb/s
  Stream #0:0[0x1](und): Video: h264 (High), yuv420p, 1080x1920, 30 fps
  Stream #0:1[0x2](und): Audio: aac (LC), 44100 Hz, stereo`;
    expect(parseFfmpegProbe(out)).toEqual({ seconds: 83.45, hasAudio: true, hasVideo: true });
  });
  it("mp3 內嵌的封面圖不算畫面", () => {
    const out = `  Duration: 00:03:00.00, start: 0.0
  Stream #0:0: Audio: mp3, 44100 Hz
  Stream #0:1: Video: mjpeg, 600x600 (attached pic)`;
    expect(parseFfmpegProbe(out)).toEqual({ seconds: 180, hasAudio: true, hasVideo: false });
  });
  it("讀不懂的檔案什麼都沒有", () => {
    expect(parseFfmpegProbe("a.bin: Invalid data found when processing input"))
      .toEqual({ seconds: 0, hasAudio: false, hasVideo: false });
  });
});

describe("frameTimestamps", () => {
  it("短片少抽、長片最多六張，都落在片長內", () => {
    expect(frameTimestamps(8)).toEqual([4]);
    expect(frameTimestamps(25)).toHaveLength(3);
    const long = frameTimestamps(3600);
    expect(long).toHaveLength(6);
    expect(long[0]).toBeGreaterThan(0);
    expect(long[5]).toBeLessThan(3600);
    expect([...long].sort((a, b) => a - b)).toEqual(long);
  });
  it("讀不到片長就抽第一格", () => {
    expect(frameTimestamps(0)).toEqual([0]);
  });
});
