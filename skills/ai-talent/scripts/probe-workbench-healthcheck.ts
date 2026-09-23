/**
 * probe-workbench-healthcheck — 策略工作台「AI 健檢」全鏈，在 DEV VM 用真實
 * 品牌跑一次。
 *
 * 2026-09-23（CJ「用戶先自己填完…如果需要我們幫忙做品牌健檢，可以用 SoWork
 * 14 步方法論掃描後，highlight 跟他原先推論有差異之處…讓用戶自己決定是否
 * 要修改」）。
 *
 * 驗的東西：
 *   1. 用一組跟品牌研究資料明顯不搭的錨點（受眾/競爭/優勢）跑健檢，AI 真的
 *      判斷出「不一致」，而不是無論如何都回一致（那樣這功能就是裝飾品）。
 *   2. 「不一致」的項目一定有 suggestedValue（可行動的建議，不是空泛警訊）。
 *   3. 用品牌自己現有的錨點（貼近正確答案）再跑一次，驗證「一致是常見且
 *      正常的結果」這條紀律有生效——不會逢跑必挑三個都有問題。
 *   4. dismissHealthCheckFinding 之後，dismissed 清單正確記到該 anchor，
 *      且不影響其他 anchor 的 findings。
 *   5. 全程只寫 positioning._workbench.healthCheck，不動 canonical 的
 *      audience/competition/differentiation 欄位——研究證據不覆寫。
 *
 * 安全性：跟其餘 probe 同一套（快照 positioning、finally 還原、逐字元比對）。
 *
 * 用法（VM 上）：
 *   cd /opt/onbrand/current/skills/ai-talent
 *   ./node_modules/.bin/tsx scripts/probe-workbench-healthcheck.ts [brandId]
 */
import { SignJWT } from "jose";
import "./../server/bootstrap-env";
import localPool from "../server/localDb";
import { getJwtSecret } from "../server/platform/core/env";

const BASE = process.env.PROBE_BASE ?? "http://127.0.0.1:3101";

let pass = 0, fail = 0;
function check(ok: boolean, label: string, detail = ""): void {
  if (ok) { pass++; console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ""}`); }
  else    { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`); }
}

async function main(): Promise<void> {
  const argBrand = parseInt(process.argv[2] ?? "", 10);

  console.log("=== 0. 挑一個真實品牌（要有 origin/values 可供獨立判斷） ===");
  const [rows]: any = await localPool.execute(
    argBrand
      ? `SELECT id, name, userId, positioning FROM brands WHERE id = ? LIMIT 1`
      : `SELECT id, name, userId, positioning FROM brands WHERE positioning IS NOT NULL ORDER BY id DESC LIMIT 1`,
    argBrand ? [argBrand] : [],
  );
  const brand = (rows as any[])[0];
  if (!brand) { console.log("  ❌ 找不到品牌，中止"); process.exit(1); }
  let pos: any = brand.positioning;
  if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { pos = {}; } }
  console.log(`  品牌 #${brand.id}「${brand.name}」owner=${brand.userId}`);
  console.log(`  origin.story: ${String(pos?.origin?.story ?? "").length} 字｜values: ${JSON.stringify(pos?.values?.items ?? []).length} 字`);

  const snapText = brand.positioning == null ? null : (typeof brand.positioning === "string" ? brand.positioning : JSON.stringify(brand.positioning));

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(brand.userId))
    .setIssuedAt().setExpirationTime("30m")
    .sign(new TextEncoder().encode(getJwtSecret()));
  const authHeaders = { authorization: `Bearer ${token}` };

  const unwrap = (r: Response, json: any) => ({
    ok: r.ok, status: r.status,
    data: json?.result?.data,
    err: json?.error?.message ?? json?.error?.json?.message,
  });
  const call = async (path: string, input: any) => {
    const r = await fetch(`${BASE}/trpc/${path}`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return unwrap(r, await r.json().catch(() => ({})));
  };

  try {
    console.log("\n=== 1. 明顯不搭的錨點 → 健檢應該挑得出不一致 ===");
    const badSelection = {
      audience: "22 歲以下重度電競玩家，主要消費是遊戲內課金與周邊",
      competitors: ["某手遊周邊品牌"],
      advantages: ["電競選手代言", "遊戲聯名限定款"],
    };
    const bad = await call("workbench.healthCheck", { brandId: brand.id, selection: badSelection });
    check(bad.ok, "healthCheck 呼叫成功（不搭版本）", bad.ok ? "" : bad.err);
    const badFindings: any[] = bad.data?.findings ?? [];
    check(badFindings.length === 3, "回傳恰好 3 筆 finding（audience/competition/differentiation 各一）", `實際 ${badFindings.length} 筆`);
    console.log("  findings:");
    for (const f of badFindings) console.log(`    ${f.anchor}: agrees=${f.agrees}${f.suggestedValue ? ` | 建議="${String(f.suggestedValue).slice(0, 60)}…"` : ""}${f.rationale ? ` | ${String(f.rationale).slice(0, 60)}` : ""}`);
    const badDisagree = badFindings.filter((f) => f.agrees === false);
    check(badDisagree.length > 0, "至少有一個 anchor 被判定不一致（不是無論如何都放行）", `不一致數 ${badDisagree.length}/3`);
    check(badDisagree.every((f) => typeof f.suggestedValue === "string" && f.suggestedValue.length > 0), "每個「不一致」都附了可行動的建議版本（不是空泛警訊）");

    console.log("\n=== 2. 品牌自己現有的錨點 → 一致應該是常見結果，不強行挑三個都有問題 ===");
    const aud = pos?.audience ?? {};
    const compRows: any[] = Array.isArray(pos?.competition?.direct) ? pos.competition.direct : [];
    const diff = pos?.differentiation ?? {};
    const ownAudience = String(aud.primary ?? "").trim();
    const ownCompetitors = compRows.slice(0, 2).map((c) => String(c?.name ?? "")).filter(Boolean);
    const ownAdvantages = [diff.functional, diff.emotional, diff.summary].filter((x) => typeof x === "string" && x.trim()).slice(0, 2) as string[];
    if (ownAudience && ownCompetitors.length > 0 && ownAdvantages.length > 0) {
      const good = await call("workbench.healthCheck", {
        brandId: brand.id,
        selection: { audience: ownAudience.slice(0, 600), competitors: ownCompetitors, advantages: ownAdvantages.map((a) => a.slice(0, 200)) },
      });
      check(good.ok, "healthCheck 呼叫成功（品牌自己的版本）", good.ok ? "" : good.err);
      const goodFindings: any[] = good.data?.findings ?? [];
      const goodDisagree = goodFindings.filter((f: any) => f.agrees === false).length;
      console.log(`  自己的版本：不一致數 ${goodDisagree}/3（預期明顯少於「不搭版本」的 ${badDisagree.length}/3，不要求為 0——AI 仍可能有不同意見）`);
      check(goodDisagree <= badDisagree.length, "品牌自己的版本不一致數沒有比亂猜的版本更多", `自己=${goodDisagree} vs 亂猜=${badDisagree.length}`);
    } else {
      console.log("  （品牌研究資料不足以組出對照組，跳過第 2 步——不影響第 1/3/4/5 步的驗證）");
    }

    console.log("\n=== 3. 持久化：DB 裡的 _workbench.healthCheck 確實是剛剛那次結果 ===");
    const [afterRows1]: any = await localPool.execute(`SELECT positioning FROM brands WHERE id = ?`, [brand.id]);
    let afterPos: any = afterRows1[0]?.positioning;
    if (typeof afterPos === "string") { try { afterPos = JSON.parse(afterPos); } catch { afterPos = {}; } }
    const savedFindings: any[] = afterPos?._workbench?.healthCheck?.findings ?? [];
    check(savedFindings.length === 3, "DB 裡存了 3 筆 findings", `實際 ${savedFindings.length}`);
    check(!!afterPos?._workbench?.healthCheck?.checkedAt, "存了 checkedAt 時間戳");

    console.log("\n=== 4. dismissHealthCheckFinding：只影響指定 anchor 的 dismissed 清單 ===");
    const targetAnchor = badDisagree[0]?.anchor ?? "audience";
    const dismissRes = await call("workbench.dismissHealthCheckFinding", { brandId: brand.id, anchor: targetAnchor });
    check(dismissRes.ok, `dismiss「${targetAnchor}」成功`, dismissRes.ok ? "" : dismissRes.err);
    const [afterRows2]: any = await localPool.execute(`SELECT positioning FROM brands WHERE id = ?`, [brand.id]);
    let afterPos2: any = afterRows2[0]?.positioning;
    if (typeof afterPos2 === "string") { try { afterPos2 = JSON.parse(afterPos2); } catch { afterPos2 = {}; } }
    const dismissedList: string[] = afterPos2?._workbench?.healthCheck?.dismissed ?? [];
    check(dismissedList.includes(targetAnchor), `dismissed 清單包含「${targetAnchor}」`, JSON.stringify(dismissedList));
    check(dismissedList.length === 1, "dismissed 清單只有這一筆，沒有誤傷其他 anchor", JSON.stringify(dismissedList));
    // findings 本身應該原封不動（dismiss 不刪資料，只是加註記）
    const findingsAfterDismiss: any[] = afterPos2?._workbench?.healthCheck?.findings ?? [];
    check(findingsAfterDismiss.length === 3, "dismiss 之後 findings 陣列本身沒被動過", `實際 ${findingsAfterDismiss.length}`);

    console.log("\n=== 5. 研究證據不覆寫：canonical audience/competition/differentiation 沒被動過 ===");
    const origAudience = JSON.stringify(pos?.audience ?? null);
    const origCompetition = JSON.stringify(pos?.competition ?? null);
    const origDifferentiation = JSON.stringify(pos?.differentiation ?? null);
    check(JSON.stringify(afterPos2?.audience ?? null) === origAudience, "positioning.audience 逐字元沒變");
    check(JSON.stringify(afterPos2?.competition ?? null) === origCompetition, "positioning.competition 逐字元沒變");
    check(JSON.stringify(afterPos2?.differentiation ?? null) === origDifferentiation, "positioning.differentiation 逐字元沒變");
  } catch (e: any) {
    check(false, "probe 中斷", String(e?.message ?? e).slice(0, 300));
  } finally {
    await localPool.execute(`UPDATE brands SET positioning = ? WHERE id = ?`, [snapText, brand.id]);
    const [afterRows]: any = await localPool.execute(`SELECT positioning AS p FROM brands WHERE id = ?`, [brand.id]);
    const after = (afterRows as any[])[0]?.p ?? null;
    const afterText = after == null ? null : (typeof after === "string" ? after : JSON.stringify(after));
    check(afterText === snapText, "positioning 已還原成探測前的原狀");
  }

  console.log(`\n=== 結果：${pass} 通過 / ${fail} 失敗 ===`);
  await localPool.end().catch(() => {});
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("probe 爆了：", e);
  await localPool.end().catch(() => {});
  process.exit(1);
});
