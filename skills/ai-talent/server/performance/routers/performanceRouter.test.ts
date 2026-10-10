/**
 * router 建得起來，procedure 名字沒撞 tRPC 保留字（專案慣例：每個 router 一支）。
 */
import { describe, expect, it } from "vitest";
import { performanceRouter } from "./performanceRouter";

describe("performanceRouter", () => {
  it("建得起來，procedure 名單如預期", () => {
    const names = Object.keys((performanceRouter as any)._def.procedures).sort();
    expect(names).toEqual([
      "acceptProposal", "addRule", "ask", "autoTag", "campaignAlias", "campaignLanding", "campaignList", "campaignManual", "campaignMatch", "campaignReport",
      "cellFacts", "connections", "importCommit", "importPreview",
      "outputTags", "proposeLens", "removeDimension", "removeImport", "removeLens", "removeRule", "report", "saveDimension",
      "saveLens", "setFactTag", "syncSocial", "tagOutput", "useTemplate", "workspace",
    ]);
  });

  it("procedure 名稱不可以撞 Function.prototype 上的東西", () => {
    for (const n of Object.keys((performanceRouter as any)._def.procedures)) {
      expect(Object.getOwnPropertyNames(Function.prototype), `「${n}」tRPC 會拒絕`).not.toContain(n);
    }
  });

  it("connections 需要 brandId", () => {
    const schema = (performanceRouter as any)._def.procedures.connections._def.inputs?.[0];
    expect(() => schema.parse({})).toThrow();
    expect(() => schema.parse({ brandId: 7 })).not.toThrow();
  });
});
