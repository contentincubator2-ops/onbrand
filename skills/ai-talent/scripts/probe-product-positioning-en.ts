/**
 * probe-product-positioning-en — 英文市場品牌的產品定位，存的是不是英文？（2026-10-02，唯讀）
 * 列出 outputLanguage 為 en* 的品牌、各產品的標語／USP／受眾，並標出含中日韓字元的欄位。
 */
import localPool from "../server/localDb.js";
const parse = (v: any) => { if (v == null) return {}; if (typeof v !== "string") return v; try { return JSON.parse(v); } catch { return {}; } };
const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;
const clip = (s: any, n = 90) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n) + "…" : t || "∅"; };
async function main() {
  const [brands]: any = await localPool.execute(
    `SELECT b.id, b.name, b.outputLanguage, b.targetCountry, COUNT(p.id) AS n
       FROM brands b JOIN products p ON p.brandId = b.id
      WHERE (b.outputLanguage IS NOT NULL AND b.outputLanguage NOT IN ('zh-TW','zh-Hant'))
         OR (b.targetCountry IS NOT NULL AND b.targetCountry NOT IN ('TW'))
      GROUP BY b.id ORDER BY n DESC LIMIT 8`);
  const [langs]: any = await localPool.execute(
    `SELECT outputLanguage, targetCountry, COUNT(*) n FROM brands GROUP BY outputLanguage, targetCountry ORDER BY n DESC LIMIT 15`);
  console.log("brands by lang/country:", JSON.stringify(langs));
  for (const b of brands as any[]) {
    console.log(`\n品牌 #${b.id} ${b.name} lang=${b.outputLanguage} country=${b.targetCountry} 產品=${b.n}`);
    const [ps]: any = await localPool.execute(`SELECT id, name, positioning FROM products WHERE brandId = ? ORDER BY id LIMIT 10`, [b.id]);
    for (const p of ps as any[]) {
      const pos = parse(p.positioning);
      const f: Record<string, any> = {
        zhTagline: pos?.core?.zhTagline, enTagline: pos?.core?.enTagline, oneLiner: pos?.core?.oneLineValueProp,
        usp: pos?.competition?.uniqueUsp, audience: pos?.audience?.primary, tone: pos?.marketing?.tone,
      };
      const bad = Object.entries(f).filter(([, v]) => typeof v === "string" && CJK.test(v)).map(([k]) => k);
      console.log(`  #${p.id} ${p.name}  ${Object.keys(pos).includes("core") ? "" : "(未定位)"} ${bad.length ? "⚠ 含中文：" + bad.join(",") : ""}`);
      if (pos?.core) for (const [k, v] of Object.entries(f)) console.log(`     ${k.padEnd(10)}: ${clip(v)}`);
    }
  }
  await localPool.end();
}
main().catch(async (e) => { console.error(e); await localPool.end(); process.exit(1); });
