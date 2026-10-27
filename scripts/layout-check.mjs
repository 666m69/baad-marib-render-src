// Layout check for the resource bar, header and map tile names at 390px and 1280px (QA #9, #15, #16).
// Not part of `npm test` (needs a browser). Usage, with the dev server on :8080:
//   npm i --no-save playwright && node scripts/layout-check.mjs /tmp/shots fresh
// then fill storage to the cap and run again with phase "full". Prints overflow problems as JSON.
import { chromium } from "playwright";
const base = "http://localhost:8080";
const out = process.argv[2] ?? "/tmp/pw";
const phase = process.argv[3] ?? "fresh";
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const results = {};
for (const [label, viewport] of [["mobile390", { width: 390, height: 844 }], ["desktop1280", { width: 1280, height: 800 }]]) {
  const ctx = await browser.newContext({ viewport, locale: "ar" });
  const page = await ctx.newPage();
  await page.goto(base + "/");
  if (phase === "fresh" && label === "mobile390") {
    await page.locator('input[type="email"]').waitFor();
    const inputs = page.locator("form input");
    await inputs.nth(0).fill("شيخ");
    await page.locator('input[type="email"]').fill("layout@baad-marib.test");
    await page.locator('input[type="password"]').fill("layout-pass-2026");
    await page.locator('form button[type="submit"]').click();
    await page.locator('input[aria-label="الاسم المستعار"]').waitFor({ timeout: 20000 });
    await page.locator('input[aria-label="الاسم المستعار"]').fill("بنو السراب الكبير");
    await page.getByRole("button", { name: "انصب المضارب" }).click();
    await page.locator('[data-testid="resource-bar"]').waitFor({ timeout: 20000 });
    await ctx.storageState({ path: `${out}/state.json` });
  } else {
    await ctx.close();
    const c2 = await browser.newContext({ viewport, locale: "ar", storageState: `${out}/state.json` });
    const p2 = await c2.newPage();
    await p2.goto(base + "/");
    await p2.locator('[data-testid="resource-bar"]').waitFor({ timeout: 20000 });
    results[label] = await measure(p2, label);
    await c2.close();
    continue;
  }
  results[label] = await measure(page, label);
  await ctx.close();
}
async function measure(page, label) {
  await page.waitForTimeout(1500);
  const shot = `${out}/${phase}-${label}.png`;
  await page.screenshot({ path: shot });
  return page.evaluate(() => {
    const bar = document.querySelector('[data-testid="resource-bar"]');
    const chips = [...bar.children].map((c) => c.getBoundingClientRect());
    const problems = [];
    [...bar.children].forEach((chip, i) => {
      const r = chips[i];
      for (const el of chip.querySelectorAll("*")) {
        const e = el.getBoundingClientRect();
        if (e.width === 0) continue;
        if (e.left < r.left - 0.5 || e.right > r.right + 0.5) problems.push(`chip ${i} child "${el.textContent}" spills ${Math.round(e.left)}..${Math.round(e.right)} outside ${Math.round(r.left)}..${Math.round(r.right)}`);
        if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) problems.push(`chip ${i} "${el.textContent}" clipped ${el.scrollWidth}>${el.clientWidth}`);
      }
      if (i > 0 && chips[i - 1].left < r.right - 0.5 && chips[i - 1].right > r.left + 0.5) problems.push(`chips ${i - 1}/${i} overlap`);
    });
    const name = document.querySelector('[data-testid="game-header"] .font-display');
    const header = document.querySelector('[data-testid="game-header"]');
    const actions = [...header.querySelectorAll("a, button")].filter((e) => !e.closest("button") || e.tagName === "BUTTON").map((e) => {
      const r = e.getBoundingClientRect();
      return { text: e.textContent.trim().slice(0, 12), top: Math.round(r.top), h: Math.round(r.height) };
    });
    // QA #15: every tribe name on the map is shown whole (not clipped by itself or its tile).
    const tiles = [...document.querySelectorAll('[data-testid="tile-name"]')].map((el) => {
      const cell = el.closest(".cell");
      const clipped = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
      const tileClips = cell ? getComputedStyle(cell).overflow !== "visible" : true;
      if (clipped || tileClips) problems.push(`tile name "${el.textContent}" clipped (self ${clipped}, tile ${tileClips})`);
      if (cell && cell.getAttribute("title") !== el.textContent) problems.push(`tile "${el.textContent}" has no full-name tooltip`);
      const r = el.getBoundingClientRect();
      return { text: el.textContent, w: Math.round(r.width), h: Math.round(r.height), lines: Math.round(r.height / parseFloat(getComputedStyle(el).lineHeight)) };
    });
    const smallest = Math.min(...[...bar.querySelectorAll("button")].map((b) => parseFloat(getComputedStyle(b).fontSize)), 99);
    return {
      problems,
      tiles,
      nameTruncated: name ? name.scrollWidth > name.clientWidth + 1 : null,
      nameText: name?.textContent,
      pageScrollWidth: document.documentElement.scrollWidth,
      actions,
      raiseFontPx: smallest === 99 ? null : smallest,
    };
  });
}
console.log(JSON.stringify(results, null, 1));
await browser.close();
