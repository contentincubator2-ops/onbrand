import { chromium, devices } from './node_modules/playwright/index.js';
import { mkdirSync } from 'fs';
const iphone = devices['iPhone 14'];
const outDir = './mobile-audit-output';
mkdirSync(outDir, { recursive: true });
const pages = [
  { name: '1-landing',  url: 'http://localhost:5199/' },
  { name: '2-login',    url: 'http://localhost:5199/auth/login' },
  { name: '3-register', url: 'http://localhost:5199/auth/register' },
  { name: '4-pricing',  url: 'http://localhost:5199/pricing' },
];
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...iphone });
const page = await ctx.newPage();
for (const p of pages) {
  try {
    await page.goto(p.url, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${outDir}/${p.name}.png`, fullPage: true });
    console.log('done:', p.name);
  } catch(e) { console.error('fail:', p.name, e.message.slice(0,100)); }
}
await browser.close();
console.log('ALL DONE');
