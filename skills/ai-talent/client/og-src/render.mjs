// 重新產生分享封面（OG 圖）：node og-src/render.mjs
// 輸出 public/static/og/onbrand-studio-og.png（1200×630）。改 og.html 的文案後重跑即可。
// 不放 /static/covers：那個路徑在 VM 上是用戶上傳圖的 symlink，部署時會被蓋掉。
import pw from "../node_modules/playwright/index.js";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
const { chromium } = pw;
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "../public/static/og/onbrand-studio-og.png");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(pathToFileURL(path.join(here, "og.html")).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out });
await browser.close();
console.log("wrote", out);
