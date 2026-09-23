/**
 * probe-strategist-chat — 「策略總監對話」全鏈，在 DEV VM 用真實品牌跑一次。
 *
 * 2026-09-23（CJ「要怎麼設計，可以讓策略總監可以提供用戶，用對話的方式，
 * 問策略總監有關於策略的問題？然後，策略總監也可以引導進行策略監測和
 * 健檢？」）。
 *
 * 驗的東西：
 *   1. getConversation 建得出對話（或拿到既有的），回傳空訊息陣列。
 *   2. 問一個「品牌定位摘要裡就有答案」的具體問題（標語是什麼），總監答得
 *      出來且引用得到真的標語文字——不是空話，證明 grounding 真的有生效。
 *   3. 問一個明顯該建議「策略監測」的問題（外部市場/競爭者有沒有變化），
 *      回應裡真的出現 open_monitor 這個 action。
 *   4. 問一個明顯該建議「策略健檢」的問題（我選的策略跟品牌故事一致嗎），
 *      回應裡真的出現 open_healthcheck 這個 action。
 *   5. 一次最多一個 action（parseActions 的 slice(0,1) 生效）。
 *   6. 訊息真的落地到 strategist_messages，且 conversationId 正確關聯。
 *
 * 安全性：跑完刪掉這次探測建立的整串對話（conversation + messages，FK
 * cascade 會連 messages 一起刪），不留垃圾資料在 dev DB。不快照/還原
 * positioning——這個功能完全不寫 positioning。
 *
 * 用法（VM 上）：
 *   cd /opt/onbrand/current/skills/ai-talent
 *   ./node_modules/.bin/tsx scripts/probe-strategist-chat.ts [brandId]
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

  console.log("=== 0. 挑一個真實品牌（要有標語，才能驗證 grounding） ===");
  const [rows]: any = await localPool.execute(
    argBrand
      ? `SELECT id, name, userId, positioning FROM brands WHERE id = ? LIMIT 1`
      : `SELECT id, name, userId, positioning FROM brands WHERE JSON_EXTRACT(positioning, '$.tagline.zhTagline') IS NOT NULL ORDER BY id DESC LIMIT 1`,
    argBrand ? [argBrand] : [],
  );
  const brand = (rows as any[])[0];
  if (!brand) { console.log("  ❌ 找不到帶標語的品牌，中止"); process.exit(1); }
  let pos: any = brand.positioning;
  if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { pos = {}; } }
  const tagline: string = pos?.tagline?.zhTagline ?? "";
  console.log(`  品牌 #${brand.id}「${brand.name}」owner=${brand.userId}｜標語＝「${tagline}」`);
  if (!tagline) { console.log("  ❌ 這個品牌沒有標語，換一個 brandId 再試"); process.exit(1); }

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
  const query = async (path: string, input: any) => {
    const url = `${BASE}/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`;
    const r = await fetch(url, { headers: authHeaders });
    return unwrap(r, await r.json().catch(() => ({})));
  };

  let conversationId: number | null = null;
  try {
    console.log("\n=== 1. getConversation：建立/取得對話 ===");
    const conv = await query("strategistChat.getConversation", { brandId: brand.id });
    check(conv.ok, "getConversation 呼叫成功", conv.ok ? "" : conv.err);
    conversationId = conv.data?.conversationId ?? null;
    check(!!conversationId, "拿到 conversationId", String(conversationId));
    if (!conversationId) throw new Error("沒有 conversationId，後面沒得驗");

    console.log("\n=== 2. 問標語是什麼——驗 grounding 是真的品牌資料，不是空話 ===");
    const r1 = await call("strategistChat.sendMessage", {
      conversationId, brandId: brand.id, content: "我們品牌的標語是什麼？直接引用給我看。",
    });
    check(r1.ok, "sendMessage 呼叫成功（標語題）", r1.ok ? "" : r1.err);
    const reply1: string = r1.data?.strategistMessage?.content ?? "";
    console.log(`  回覆：${reply1.slice(0, 200)}`);
    check(reply1.includes(tagline), "回覆裡逐字引用了真實標語（不是編的）", reply1.includes(tagline) ? "" : `期望包含「${tagline}」`);

    console.log("\n=== 3. 問外部市場變化——應該建議 open_monitor ===");
    const r2 = await call("strategistChat.sendMessage", {
      conversationId, brandId: brand.id, content: "最近競爭者有沒有什麼新動作，或市場趨勢在往哪裡走？我該注意什麼嗎？",
    });
    check(r2.ok, "sendMessage 呼叫成功（市場題）", r2.ok ? "" : r2.err);
    const actions2: any[] = r2.data?.strategistMessage?.actions ?? [];
    console.log(`  回覆：${(r2.data?.strategistMessage?.content ?? "").slice(0, 200)}`);
    console.log(`  actions: ${JSON.stringify(actions2)}`);
    check(actions2.some((a) => a.kind === "open_monitor"), "建議了 open_monitor", JSON.stringify(actions2));
    check(actions2.length <= 1, "一次最多一個 action", `實際 ${actions2.length} 個`);

    console.log("\n=== 4. 問內部一致性——應該建議 open_healthcheck ===");
    const r3 = await call("strategistChat.sendMessage", {
      conversationId, brandId: brand.id, content: "我在策略工作台選的受眾、競爭者、優勢，跟我們品牌真正的故事講的是同一件事嗎？我不太確定有沒有選歪。",
    });
    check(r3.ok, "sendMessage 呼叫成功（一致性題）", r3.ok ? "" : r3.err);
    const actions3: any[] = r3.data?.strategistMessage?.actions ?? [];
    console.log(`  回覆：${(r3.data?.strategistMessage?.content ?? "").slice(0, 200)}`);
    console.log(`  actions: ${JSON.stringify(actions3)}`);
    check(actions3.some((a) => a.kind === "open_healthcheck"), "建議了 open_healthcheck", JSON.stringify(actions3));

    console.log("\n=== 5. DB 落地確認：訊息真的存進 strategist_messages ===");
    const [msgRows]: any = await localPool.execute(
      `SELECT id, role, LEFT(content, 40) AS preview FROM strategist_messages WHERE conversationId = ? ORDER BY id`,
      [conversationId],
    );
    const msgs = msgRows as any[];
    check(msgs.length === 6, "共 6 則訊息（3 輪 × user+strategist）", `實際 ${msgs.length} 則`);
    check(msgs.filter((m) => m.role === "user").length === 3, "3 則 user 訊息");
    check(msgs.filter((m) => m.role === "strategist").length === 3, "3 則 strategist 訊息");
  } catch (e: any) {
    check(false, "probe 中斷", String(e?.message ?? e).slice(0, 300));
  } finally {
    if (conversationId) {
      // FK ON DELETE CASCADE 會連 strategist_messages 一起清掉。
      await localPool.execute(`DELETE FROM strategist_conversations WHERE id = ?`, [conversationId]).catch(() => {});
      const [after]: any = await localPool.execute(`SELECT id FROM strategist_conversations WHERE id = ?`, [conversationId]);
      check((after as any[]).length === 0, "探測用的對話已清乾淨（cascade 刪除 messages）");
    }
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
