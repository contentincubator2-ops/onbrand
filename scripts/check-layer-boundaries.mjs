#!/usr/bin/env node
/**
 * check-layer-boundaries — 檢查程式碼的層間依賴是否照 skills/ai-talent/ARCHITECTURE.md 的規則。
 *
 * 規則是一條線性順序，每一層只能引用順序在它之前（含自己）的層：
 *
 *     platform  <  strategy  <  content  <  performance
 *
 *   - platform      基礎設施：登入、計費、LLM、媒體與網頁工具、連接器
 *   - strategy      策略層：品牌／產品／活動定位、品牌大腦
 *   - content       內容層：任務卡、產出、排程、活動企劃工作區
 *   - performance   成效層：資料匯入、儀表板、活動達成率
 *
 * 另外有兩個「組合層」，可以引用所有層，但沒有任何層可以引用它們：
 *   - server/gateway      對外入口（MCP 連接器、landing、通知）
 *   - client v2/app       路由與外殼（AppV2、ShellLayout）
 *   以及 server/index.ts、server/routers/index.ts、server/bootstrap-env.ts（組裝點）。
 *
 * 基礎檔（server 的 db／localDb、drizzle、client 的 lib／components／locales／types）
 * 任何層都可以引用，它們自己不能引用任何層。
 * 測試檔不受限（可以跨層驗證）；client 的 lib/trpc.ts 可以 import type 伺服器的 appRouter。
 *
 * 違規時請搬檔案或改成由組合層注入，不要加例外。用法：node scripts/check-layer-boundaries.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const AT = 'skills/ai-talent/';
const ORDER = ['platform', 'strategy', 'content', 'performance'];

const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const tracked = execSync('git ls-files --cached --others --exclude-standard', { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n').filter(Boolean);
const set = new Set(tracked);
const isTest = (f) => /\.test\.(ts|tsx)$/.test(f);

function layerOf(f) {
  let m;
  if (f.startsWith(AT + 'server/')) {
    m = f.match(/^skills\/ai-talent\/server\/(platform|strategy|content|performance|gateway)\//);
    if (m) return 's:' + m[1];
    if (/^skills\/ai-talent\/server\/(index|bootstrap-env|routers\/index)\.ts$/.test(f)) return 's:assembly';
    return 's:base';
  }
  if (f.startsWith(AT + 'drizzle/')) return 's:base';
  if (f.startsWith(AT + 'client/src/v2/')) {
    m = f.match(/^skills\/ai-talent\/client\/src\/v2\/(platform|strategy|content|performance|app)\//);
    return m ? 'c:' + m[1] : 'c:base';
  }
  if (f.startsWith(AT + 'client/src/')) {
    return /^skills\/ai-talent\/client\/src\/(pages\/|main\.tsx)/.test(f) ? 'c:app' : 'c:base';
  }
  return null; // scripts、e2e 不受限
}

function allowed(a, b) {
  if (a === b) return true;
  const [sa, la] = a.split(':');
  const [sb, lb] = b.split(':');
  if (sa !== sb) return false;
  if (la === 'app' || la === 'assembly' || la === 'gateway') return true;
  if (lb === 'base') return true;
  if (la === 'base') return false;
  const ia = ORDER.indexOf(la);
  const ib = ORDER.indexOf(lb);
  return ia >= 0 && ib >= 0 && ib <= ia;
}

const patterns = [
  /(?:^|[^\w$.])(?:import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s+)?(['"])([^'"\n]+)\2/g,
  /(?:^|[^\w$.])import\s*\(\s*(['"])([^'"\n]+)\1/g,
  /(?:^|[^\w$.])require\s*\(\s*(['"])([^'"\n]+)\1/g,
];
function specs(text) {
  const out = [];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const spec = m[3] ?? m[2];
      out.push({ spec, typeOnly: re === patterns[0] && !!m[1] });
    }
  }
  return out;
}
function resolve(from, spec) {
  if (!spec.startsWith('.')) return null;
  const b = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  const st = b.replace(/\.(js|jsx|mjs|cjs)$/, '');
  for (const c of [b, st, st + '.ts', st + '.tsx', st + '.js', st + '/index.ts', st + '/index.tsx', st + '/index.js'])
    if (set.has(c)) return c;
  return null;
}

const label = { 's:base': 'server 基礎檔', 's:assembly': 'server 組裝點', 'c:base': 'client 基礎檔', 'c:app': 'client app 層' };
const name = (l) => label[l] ?? l.replace('s:', 'server/').replace('c:', 'client/');

const violations = [];
for (const f of tracked) {
  if (!/\.(ts|tsx)$/.test(f) || isTest(f)) continue;
  const la = layerOf(f);
  if (!la) continue;
  const text = fs.readFileSync(path.join(root, f), 'utf8');
  for (const s of specs(text)) {
    const t = resolve(f, s.spec);
    if (!t) continue;
    const lb = layerOf(t);
    if (!lb) continue;
    if (la === 'c:base' && lb === 's:assembly' && s.typeOnly) continue; // lib/trpc.ts 取 appRouter 型別
    if (!allowed(la, lb)) violations.push({ f, t, la, lb });
  }
}

if (violations.length === 0) {
  console.log('通過：層間依賴符合 platform < strategy < content < performance，沒有違規。');
  process.exit(0);
}
console.error(`層間依賴違規 ${violations.length} 處（規則見 skills/ai-talent/ARCHITECTURE.md）：\n`);
for (const v of violations) {
  console.error(`  ${v.f.replace(AT, '')}\n    [${name(v.la)}] 不能引用 [${name(v.lb)}]：${v.t.replace(AT, '')}`);
}
console.error('\n處理方式：把被引用的檔案搬到順序較前的層（通用工具進 platform），或改由 gateway／app 層組合後注入；不要加例外。');
process.exit(1);
