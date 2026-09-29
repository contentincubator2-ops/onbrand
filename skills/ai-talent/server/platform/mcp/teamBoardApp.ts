/**
 * teamBoardApp — OnBrand 連接器的 MCP App（Claude 對話中嵌入的介面）。
 *
 * 2026-09-28（CJ「claude 哪個介面看起來比較像團隊在協作？customize、project 都不像」）：
 * Claude 原生介面永遠是「一個 Claude」，團隊感要由我們畫出來。這一頁是 team_board 與
 * get_task_result 共用的 UI：看板（本週企劃＋每位成員在做什麼）與貼文預覽。
 *
 * 協定：MCP Apps（SEP-1865，2026-01-26）。沒有 bundler、沒有外部腳本 —— host 的沙盒 CSP
 * 預設不給外部來源，全部內嵌。規格重點：
 *   app → host  ui/initialize → ui/notifications/initialized；tools/call；ui/open-link；ui/message；
 *               ui/notifications/size-changed
 *   host → app  ui/notifications/tool-result（params 就是 CallToolResult，含 structuredContent）；
 *               ui/notifications/host-context-changed
 *
 * 注意：這段 HTML 放在 TS 樣板字串裡，內嵌 JS 刻意不用反引號與「$ + 大括號」。
 */
export const TEAM_BOARD_APP_HTML = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>OnBrand 團隊</title>
<style>
  :root{
    --bg:var(--color-background-primary,#ffffff);--bg2:var(--color-background-secondary,#f7f5f2);
    --ink:var(--color-text-primary,#1a1a1a);--mute:var(--color-text-secondary,#6b6b6b);
    --line:var(--color-border-primary,#e7e2da);--accent:#e8590c;--ok:#2f9e44;--warn:#e67700;--bad:#c92a2a;
    color-scheme:light dark;
  }
  :root[data-theme="dark"]{--bg:var(--color-background-primary,#1f1e1c);--bg2:var(--color-background-secondary,#282724);
    --ink:var(--color-text-primary,#f2f0ec);--mute:var(--color-text-secondary,#a19d97);--line:var(--color-border-primary,#3a3733)}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 var(--font-sans,-apple-system,"Noto Sans TC","PingFang TC",sans-serif)}
  .wrap{padding:14px}
  header{display:flex;align-items:center;gap:8px;margin-bottom:12px}
  header h1{font-size:15px;margin:0;font-weight:650} header .sub{color:var(--mute);font-size:12px}
  header .sp{flex:1}
  button,.btn{font:inherit;font-size:12px;border:1px solid var(--line);background:transparent;color:var(--ink);border-radius:8px;padding:5px 10px;cursor:pointer}
  button.primary{background:var(--accent);border-color:var(--accent);color:#fff}
  button:disabled{opacity:.5;cursor:default}
  h2{font-size:12px;color:var(--mute);font-weight:600;margin:16px 0 8px;letter-spacing:.02em}
  .team{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}
  .member{border:1px solid var(--line);border-radius:10px;padding:10px;background:var(--bg)}
  .member .who{display:flex;align-items:center;gap:8px}
  .av{width:28px;height:28px;border-radius:50%;background:var(--bg2);display:grid;place-items:center;font-size:13px;font-weight:600;overflow:hidden;flex:none}
  .av img{width:100%;height:100%;object-fit:cover}
  .member .name{font-weight:600;font-size:13px} .member .role{color:var(--mute);font-size:11px}
  .member .doing{margin-top:6px;font-size:12px;color:var(--mute)}
  .week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
  .day{border:1px solid var(--line);border-radius:8px;min-height:74px;padding:6px;background:var(--bg2)}
  .day .d{font-size:11px;color:var(--mute);margin-bottom:4px}
  .slot{font-size:11px;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:4px 5px;margin-bottom:4px;word-break:break-word}
  .slot .p{font-weight:600;margin-right:3px} .slot.written{border-color:var(--ok)}
  .list{display:flex;flex-direction:column;gap:6px}
  .item{display:flex;gap:10px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:8px}
  .thumb{width:44px;height:44px;border-radius:6px;background:var(--bg2);object-fit:cover;flex:none}
  .item .t{flex:1;min-width:0} .item .t b{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .item .t span{font-size:11px;color:var(--mute)}
  .pill{font-size:11px;border-radius:999px;padding:1px 8px;border:1px solid currentColor;white-space:nowrap}
  .s-writing,.s-running{color:var(--warn)} .s-imaging{color:var(--accent)} .s-ready{color:var(--ok)} .s-failed{color:var(--bad)}
  .empty{color:var(--mute);font-size:12px;padding:8px 0}
  /* 貼文預覽（FB/IG 風格的中性卡片） */
  .post{border:1px solid var(--line);border-radius:12px;max-width:520px;background:var(--bg);overflow:hidden;margin-bottom:12px}
  .post .ph{display:flex;align-items:center;gap:8px;padding:10px 12px}
  .post .ph b{font-size:13px} .post .ph span{font-size:11px;color:var(--mute);display:block}
  .post .cap{padding:0 12px 10px;white-space:pre-wrap;font-size:14px}
  .post .tags{padding:0 12px 10px;color:#1c6ed6;font-size:13px}
  .post img.main{display:block;width:100%;max-height:520px;object-fit:cover;background:var(--bg2)}
  .post .noimg{padding:28px 12px;text-align:center;color:var(--mute);background:var(--bg2);font-size:12px}
  .tabs{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap}
  .tabs button.on{border-color:var(--accent);color:var(--accent)}
  .by{font-size:12px;color:var(--mute);margin-bottom:10px}
  .row{display:flex;gap:8px;flex-wrap:wrap}
  @media (max-width:560px){.week{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style></head>
<body><div class="wrap" id="root"><div class="empty">OnBrand 團隊連線中…</div></div>
<script>
(function(){
  var root = document.getElementById("root");
  var nextId = 1, pending = {};
  var boardData = null;

  function send(msg){ window.parent.postMessage(msg, "*"); }
  function request(method, params){
    var id = nextId++;
    send({ jsonrpc: "2.0", id: id, method: method, params: params || {} });
    return new Promise(function(resolve, reject){ pending[id] = { resolve: resolve, reject: reject }; });
  }
  function notify(method, params){ send({ jsonrpc: "2.0", method: method, params: params || {} }); }

  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return { "&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;" }[c]; }); }
  function safeUrl(u){ return /^https:\\/\\//i.test(String(u || "")) || /^http:\\/\\/(localhost|127\\.0\\.0\\.1)/i.test(String(u || "")) ? String(u) : ""; }
  var STATUS = { running:"排隊中", writing:"寫稿中", imaging:"配圖中", ready:"待你審", failed:"失敗" };
  var PLAT = { facebook:"FB", instagram:"IG", youtube:"YouTube", tiktok:"TikTok", linkedin:"LinkedIn", email:"Email", press:"新聞稿", threads:"Threads" };

  function avatar(a, fallback){
    var src = a && safeUrl(a.avatarUrl);
    if (src) return '<div class="av"><img alt="" src="' + esc(src) + '"></div>';
    var ch = ((a && a.name) || fallback || "?").slice(0, 1);
    return '<div class="av">' + esc(ch) + '</div>';
  }

  function applyTheme(ctx){
    if (!ctx) return;
    if (ctx.theme) document.documentElement.setAttribute("data-theme", ctx.theme);
    var vars = ctx.styles && ctx.styles.variables;
    if (vars) for (var k in vars) { if (Object.prototype.hasOwnProperty.call(vars, k)) document.documentElement.style.setProperty(k, vars[k]); }
  }

  function openLink(url){ if (safeUrl(url)) request("ui/open-link", { url: url }).catch(function(){}); }
  function say(text){ request("ui/message", { role: "user", content: { type: "text", text: text } }).catch(function(){}); }

  // ── 看板 ──────────────────────────────────────────────────────────
  function team(d){
    var work = d.work || [];
    var writers = {}, order = [];
    work.forEach(function(w){
      if (!w.agent || !w.agent.name) return;
      if (!writers[w.agent.name]) { writers[w.agent.name] = { agent: w.agent, items: [] }; order.push(w.agent.name); }
      writers[w.agent.name].items.push(w);
    });
    var slots = d.slots || [];
    var unwritten = slots.filter(function(s){ return s.status !== "written"; }).length;
    var inflight = work.filter(function(w){ return w.status === "writing" || w.status === "running"; });
    var imaging = work.filter(function(w){ return w.status === "imaging"; });
    var cards = [];
    cards.push({ a: { name: "總主管" }, role: "策略・本週企劃", doing: slots.length ? ("本週排了 " + slots.length + " 格，還有 " + unwritten + " 格未寫") : "本週還沒排企劃" });
    order.slice(0, 4).forEach(function(n){
      var g = writers[n], now = g.items.filter(function(w){ return w.status === "writing" || w.status === "imaging"; })[0];
      cards.push({ a: g.agent, role: g.agent.title || "寫手", doing: now ? ((STATUS[now.status] || "") + "：" + (now.taskLabel || now.title)) : ("最近完成：" + (g.items[0].taskLabel || g.items[0].title)) });
    });
    if (inflight.length && !order.length) cards.push({ a: { name: "寫手" }, role: "文案", doing: "寫稿中：" + (inflight[0].taskLabel || "") });
    cards.push({ a: { name: "設計" }, role: "配圖", doing: imaging.length ? ("配圖中 " + imaging.length + " 件") : "待命" });
    return '<div class="team">' + cards.map(function(c){
      return '<div class="member"><div class="who">' + avatar(c.a) + '<div><div class="name">' + esc(c.a.name) + '</div><div class="role">' + esc(c.role) + '</div></div></div><div class="doing">' + esc(c.doing) + '</div></div>';
    }).join("") + '</div>';
  }

  function week(d){
    var by = {};
    (d.slots || []).forEach(function(s){ (by[s.slotDate] = by[s.slotDate] || []).push(s); });
    return '<div class="week">' + (d.days || []).map(function(day){
      var items = (by[day.date] || []).map(function(s){
        return '<div class="slot' + (s.status === "written" ? " written" : "") + '"><span class="p">' + esc(s.platformZh || s.platform) + '</span>' + esc(s.topic) + '</div>';
      }).join("");
      return '<div class="day"><div class="d">' + esc(day.label) + ' ' + esc(day.date.slice(5)) + '</div>' + items + '</div>';
    }).join("") + '</div>';
  }

  function workList(d){
    var work = d.work || [];
    if (!work.length) return '<div class="empty">還沒有成品。跟 Claude 說「幫我寫一篇 FB」就會交辦給團隊。</div>';
    return '<div class="list">' + work.slice(0, 10).map(function(w){
      var th = safeUrl(w.thumbnailUrl) ? '<img class="thumb" alt="" src="' + esc(w.thumbnailUrl) + '">' : '<div class="thumb"></div>';
      var meta = [PLAT[w.platform] || w.platform, w.agent && w.agent.name].filter(Boolean).join("・");
      var btn = w.outputId ? '<button data-preview="' + w.outputId + '">預覽</button>' : "";
      return '<div class="item">' + th + '<div class="t"><b>' + esc(w.taskLabel || w.title) + '</b><span>' + esc(meta) + (w.error ? "・" + esc(w.error) : "") + '</span></div><span class="pill s-' + esc(w.status) + '">' + esc(STATUS[w.status] || w.status) + '</span>' + btn + '</div>';
    }).join("") + '</div>';
  }

  function renderBoard(d){
    boardData = d;
    root.innerHTML =
      '<header><div><h1>' + esc(d.brand && d.brand.name) + ' 行銷團隊</h1><div class="sub">本週 ' + esc(d.weekStart) + ' 起</div></div><div class="sp"></div>' +
      '<button data-open="' + esc(d.links && d.links.planner) + '">在 OnBrand 開啟本週企劃</button></header>' +
      '<h2>團隊成員</h2>' + team(d) +
      '<h2>本週企劃</h2>' + week(d) +
      '<h2>最近的工作</h2>' + workList(d);
  }

  // ── 貼文預覽 ─────────────────────────────────────────────────────
  var postState = { d: null, idx: 0 };
  function renderPost(d){
    postState.d = d;
    var back = boardData ? '<button data-back="1">← 回看板</button>' : "";
    if (d.status === "writing" || d.status === "running") {
      root.innerHTML = '<header>' + back + '<h1>' + esc(d.taskLabel) + '</h1></header><div class="empty">團隊還在寫，請稍候再查一次。</div>';
      return;
    }
    if (d.status === "failed") {
      root.innerHTML = '<header>' + back + '<h1>' + esc(d.taskLabel) + '</h1></header><div class="empty s-failed">失敗：' + esc(d.error || "未知原因") + '</div>';
      return;
    }
    var vs = d.variants || [];
    var i = Math.min(postState.idx, Math.max(vs.length - 1, 0));
    var v = vs[i] || { caption: "", hashtags: [] };
    var tabs = vs.length > 1 ? '<div class="tabs">' + vs.map(function(x, k){ return '<button data-v="' + k + '" class="' + (k === i ? "on" : "") + '">' + esc(x.label || ("版本 " + (k + 1))) + '</button>'; }).join("") + '</div>' : "";
    var img = safeUrl(v.imageUrl) ? '<img class="main" alt="" src="' + esc(v.imageUrl) + '">'
      : (d.status === "imaging" ? '<div class="noimg">設計正在配圖…</div>' : "");
    var brand = d.brand || { name: "" };
    var tags = (v.hashtags || []).map(function(h){ return h.charAt(0) === "#" ? h : "#" + h; }).join(" ");
    root.innerHTML =
      '<header>' + back + '<div><h1>' + esc(d.taskLabel) + '</h1><div class="sub">' + esc(PLAT[d.platform] || d.platform || "") + '・<span class="s-' + esc(d.status) + '">' + esc(STATUS[d.status] || d.status) + '</span></div></div></header>' +
      (d.agent ? '<div class="by">' + esc(d.agent.name) + (d.agent.title ? "・" + esc(d.agent.title) : "") + ' 執筆</div>' : "") +
      tabs +
      '<div class="post"><div class="ph">' + avatar({ name: brand.name, avatarUrl: brand.logoUrl }) + '<div><b>' + esc(brand.name) + '</b><span>預覽</span></div></div>' +
      '<div class="cap">' + esc(v.caption) + '</div>' + (tags ? '<div class="tags">' + esc(tags) + '</div>' : "") + img + '</div>' +
      '<div class="row"><button class="primary" data-open="' + esc(d.link) + '">在 OnBrand 開啟、排程</button>' +
      '<button data-say="' + esc("我想調整「" + (d.taskLabel || "") + "」（成品 " + d.outputId + "，" + (v.label || "") + "）：") + '">請團隊修改</button></div>';
  }

  function render(result){
    var d = result && result.structuredContent;
    if (!d) { root.innerHTML = '<div class="empty">' + esc(((result && result.content) || []).map(function(c){ return c.text || ""; }).join("\\n")) + '</div>'; return; }
    if (d.view === "board") renderBoard(d); else renderPost(d);
  }

  root.addEventListener("click", function(e){
    var b = e.target.closest("button"); if (!b) return;
    if (b.dataset.open) openLink(b.dataset.open);
    else if (b.dataset.say) say(b.dataset.say);
    else if (b.dataset.v) { postState.idx = Number(b.dataset.v); renderPost(postState.d); }
    else if (b.dataset.back && boardData) { postState.idx = 0; renderBoard(boardData); }
    else if (b.dataset.preview) {
      b.disabled = true; b.textContent = "載入中…";
      request("tools/call", { name: "get_task_result", arguments: { outputId: Number(b.dataset.preview) } })
        .then(function(r){ postState.idx = 0; render(r); })
        .catch(function(){ b.disabled = false; b.textContent = "預覽"; });
    }
  });

  window.addEventListener("message", function(ev){
    var m = ev.data;
    if (!m || m.jsonrpc !== "2.0") return;
    if (m.id != null && pending[m.id] && (m.result !== undefined || m.error)) {
      var p = pending[m.id]; delete pending[m.id];
      if (m.error) p.reject(m.error); else p.resolve(m.result);
      return;
    }
    if (m.method === "ui/notifications/tool-result") render(m.params);
    else if (m.method === "ui/notifications/host-context-changed") applyTheme(m.params);
    else if (m.method === "ui/resource-teardown" && m.id != null) send({ jsonrpc: "2.0", id: m.id, result: {} });
  });

  var lastH = 0;
  function reportSize(){
    var h = Math.ceil(document.documentElement.scrollHeight);
    if (Math.abs(h - lastH) < 2) return; lastH = h;
    notify("ui/notifications/size-changed", { width: Math.ceil(document.documentElement.scrollWidth), height: h });
  }
  if (window.ResizeObserver) new ResizeObserver(reportSize).observe(document.body);

  request("ui/initialize", {
    protocolVersion: "2026-01-26",
    clientInfo: { name: "onbrand-team-board", version: "1.0.0" },
    appCapabilities: { availableDisplayModes: ["inline", "fullscreen"] }
  }).then(function(r){
    applyTheme(r && r.hostContext);
    notify("ui/notifications/initialized", {});
    reportSize();
  }).catch(function(){ notify("ui/notifications/initialized", {}); });
})();
</script></body></html>`;
