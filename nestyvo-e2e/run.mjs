// Replays Charlene's Oct 10 screen recording ("Screen Recording Test(2026-10-10
// 07_34 GMT-7).mp4") against the live app, checkpoint by checkpoint, and builds
// out/report.html: her words + the recording frame at that timestamp next to
// a screenshot of the same screen today, plus any automatic pass/fail checks.
//
//   cp .env.e2e.example .env.e2e   # fill in the two logins
//   npm run compare                # read-only: navigates and screenshots, books nothing
//   npm run compare:write          # also runs the booking checkpoints (one real
//                                  # booking for a fixed test client, cancelled at the end)
//   npm run compare -- --only C06,C07   # run a subset
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECKPOINTS } from './checkpoints.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const HEADED = args.includes('--headed');
const onlyIdx = args.indexOf('--only');
const ONLY = onlyIdx >= 0 ? args[onlyIdx + 1].split(',') : null;

// ---- config ---------------------------------------------------------------
const envFile = join(HERE, '.env.e2e');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
const cfg = {
  url: process.env.NESTYVO_URL || 'https://profound-medovik-ac1b30.netlify.app',
  video: process.env.RECORDING || join(HERE, '..', 'Screen Recording Test(2026-10-10 07_34 GMT-7).mp4'),
  admin: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD },
  provider: { email: process.env.PROVIDER_EMAIL, password: process.env.PROVIDER_PASSWORD },
  apiUrl: process.env.API_URL || 'https://nestyvo-crm-production.up.railway.app/api/v1',
  providerName: process.env.PROVIDER_NAME || 'Gloria',
  // Admin checkpoints follow Charlene's recording, which worked on Gloria's real calendar (read-only).
  adminProviderName: process.env.ADMIN_PROVIDER_NAME || 'Gloria Ortiz',
  testClient: process.env.TEST_CLIENT || 'Playwright Tester',
};
const neededRoles = new Set(CHECKPOINTS
  .filter((c) => (!ONLY || ONLY.includes(c.id)) && (WRITE || !c.write) && c.role !== 'none')
  .map((c) => c.role));
for (const role of neededRoles) {
  if (!cfg[role].email || !cfg[role].password) {
    console.error(`Missing ${role.toUpperCase()}_EMAIL / ${role.toUpperCase()}_PASSWORD (set them in .env.e2e).`);
    process.exit(1);
  }
}
// Charlene's browser window in the recording is a full-width MacBook Chrome tab.
const VIEWPORT = { width: 1512, height: 820 };

mkdirSync(join(OUT, 'app'), { recursive: true });
mkdirSync(join(OUT, 'video'), { recursive: true });

// ---- helpers handed to every checkpoint ----------------------------------
// Expo Router's tabs keep other screens mounted *and laid out* underneath the
// active one, so Playwright's isVisible() is true for text on a hidden tab.
// "On screen" here means: inside the viewport and actually the topmost
// element at its own position.
async function onTop(locator) {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom < 0 || r.top > window.innerHeight) return false;
    const t = document.elementFromPoint(r.left + Math.min(r.width / 2, 8), r.top + r.height / 2);
    return !!t && (t === el || el.contains(t) || t.contains(el));
  }).catch(() => false);
}
async function firstOnTop(locator, { last = false } = {}) {
  const n = await locator.count();
  const order = [...Array(n).keys()];
  if (last) order.reverse();
  for (const i of order) if (await onTop(locator.nth(i))) return locator.nth(i);
  return null;
}
/** Like firstOnTop, but scrolls each candidate into view first (for clicking). */
async function scrollToOnTop(locator, { last = false } = {}) {
  const n = await locator.count();
  const order = [...Array(n).keys()];
  if (last) order.reverse();
  for (const i of order) {
    const el = locator.nth(i);
    if (await onTop(el)) return el;
    if (!(await el.isVisible().catch(() => false))) continue;
    await el.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
    if (await onTop(el)) return el;
  }
  return null;
}
async function waitOnTop(locator, timeout, opts = {}) {
  const end = Date.now() + timeout;
  do {
    const el = opts.scroll ? await scrollToOnTop(locator, opts) : await firstOnTop(locator, opts);
    if (el) return el;
    await new Promise((r) => setTimeout(r, 250));
  } while (Date.now() < end);
  return null;
}

function makeHelpers(page, role, cleanup) {
  const h = {
    page, cfg, role, WRITE,
    checks: [],
    check(label, pass, detail = '') { h.checks.push({ label, pass: !!pass, detail }); },
    note(label, detail = '') { h.checks.push({ label, pass: null, detail }); },
    async text(t, opts = {}) { return page.getByText(t, { exact: opts.exact ?? false }).first(); },
    /** Click the on-screen element with this text (opts.last: prefer the last match, e.g. inside a modal). */
    async click(t, opts = {}) {
      const el = await waitOnTop(page.getByText(t, { exact: opts.exact ?? true }), opts.timeout ?? 10_000, { scroll: true, ...opts });
      if (!el) throw new Error(`"${t}" not on screen`);
      await el.click();
      await page.waitForTimeout(opts.settle ?? 900);
    },
    async has(t, opts = {}) {
      return !!(await waitOnTop(page.getByText(t, { exact: opts.exact ?? false }), opts.timeout ?? 2_500));
    },
    async waitFor(t, timeout = 10_000) {
      if (!(await waitOnTop(page.getByText(t, { exact: false }), timeout))) throw new Error(`"${t}" never appeared`);
    },
    /** True when the element's top is inside the visible viewport (no scrolling needed). */
    async aboveFold(t) {
      const el = await firstOnTop(page.getByText(t, { exact: false }));
      const box = el && (await el.boundingBox());
      return !!box && box.y >= 0 && box.y < VIEWPORT.height;
    },
    onTop, firstOnTop,
    async home() {
      await page.goto(cfg.url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
    },
    cleanup,
  };
  return h;
}

async function login(browser, who) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  await page.goto(cfg.url, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@practice.com').fill(cfg[who].email);
  await page.getByPlaceholder('••••••••').fill(cfg[who].password);
  await page.getByText('Sign In', { exact: true }).click();
  await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 20_000 });
  await page.waitForTimeout(2000);
  // Remember the bearer token the app sends, for API-side cleanup of anything a
  // --write checkpoint books.
  let token = null;
  page.on('request', (r) => {
    const a = r.headers()['authorization'];
    if (a?.startsWith('Bearer ')) token = a.slice(7);
  });
  return { context, page, getToken: () => token };
}

function extractFrame(ts, file) {
  if (existsSync(file)) return true;
  if (!existsSync(cfg.video)) return false;
  try {
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', ts, '-i', cfg.video, '-frames:v', '1',
      '-vf', 'crop=1432:780:8:155', file]);
    return true;
  } catch { return false; }
}

// ---- run -------------------------------------------------------------------
const browser = await chromium.launch({ headless: !HEADED });
const sessions = {};
const cleanupTasks = [];
const results = [];

const todo = CHECKPOINTS.filter((c) => (!ONLY || ONLY.includes(c.id)) && (WRITE || !c.write));
const skipped = CHECKPOINTS.filter((c) => c.write && !WRITE && (!ONLY || ONLY.includes(c.id)));

for (const cp of todo) {
  process.stdout.write(`${cp.id} [${cp.ts}] ${cp.title} … `);
  let page;
  if (cp.role === 'none') {
    const ctx = await browser.newContext({ viewport: VIEWPORT });
    page = await ctx.newPage();
  } else {
    sessions[cp.role] ??= await login(browser, cp.role);
    page = sessions[cp.role].page;
  }
  const h = makeHelpers(page, cp.role, (fn) => cleanupTasks.push({ fn, session: sessions[cp.role] }));
  let error = null;
  try {
    await cp.run(h);
  } catch (e) {
    error = e.message.split('\n')[0];
  }
  const shot = `app/${cp.id}.png`;
  await page.screenshot({ path: join(OUT, shot) }).catch(() => {});
  const frame = `video/${cp.id}.jpg`;
  const haveFrame = extractFrame(cp.frameAt ?? cp.ts, join(OUT, frame));
  const failed = h.checks.some((c) => c.pass === false);
  const passedAny = h.checks.some((c) => c.pass === true);
  console.log(error ? `ERROR (${error})` : failed ? 'FAIL' : passedAny ? 'pass' : 'look (compare screenshots)');
  results.push({ ...cp, checks: h.checks, error, shot, frame: haveFrame ? frame : null });
  if (cp.role === 'none') await page.context().close();
}

for (const { fn, session } of cleanupTasks) {
  try { await fn({ token: session.getToken(), request: session.context.request }); console.log('cleanup ok'); }
  catch (e) { console.log(`cleanup FAILED: ${e.message}`); }
}
await browser.close();

// ---- report ----------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const badge = (r) => r.error ? '<b class="err">ERROR</b>'
  : r.checks.some((c) => c.pass === false) ? '<b class="fail">FAIL</b>'
  : r.checks.some((c) => c.pass === true) ? '<b class="pass">PASS</b>' : '<b class="man">LOOK</b>';
const rows = results.map((r) => `
<section>
  <h2>${badge(r)} ${r.id} · <span class="ts">${r.ts}</span> · ${esc(r.title)}</h2>
  <blockquote>“${esc(r.quote)}”</blockquote>
  <p class="want"><b>What she asked for:</b> ${esc(r.expect)}</p>
  ${r.error ? `<p class="errline">Script error: ${esc(r.error)} (screenshot shows where it stopped; a selector may need updating)</p>` : ''}
  <ul>${r.checks.map((c) => `<li class="${c.pass === null ? 'man' : c.pass ? 'pass' : 'fail'}">${c.pass === null ? '◦' : c.pass ? '✓' : '✗'} ${esc(c.label)}${c.detail ? ` — <i>${esc(c.detail)}</i>` : ''}</li>`).join('')}</ul>
  <div class="pair">
    <figure><figcaption>Recording @ ${r.frameAt ?? r.ts}</figcaption>${r.frame ? `<img src="${r.frame}">` : '<div class="nof">frame unavailable</div>'}</figure>
    <figure><figcaption>Live app now (${r.role})</figcaption><img src="${r.shot}"></figure>
  </div>
</section>`).join('\n');
const html = `<!doctype html><meta charset="utf-8"><title>Charlene recording vs live app</title>
<style>
body{font:14px/1.45 -apple-system,system-ui,sans-serif;margin:0;padding:24px;background:#f6f7f9;color:#111}
section{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px 20px;margin:0 0 20px}
h1{margin:0 0 4px}h2{font-size:16px;margin:0 0 8px}.ts{color:#6b7280;font-variant-numeric:tabular-nums}
blockquote{margin:0 0 8px;padding:6px 12px;border-left:3px solid #c7d2fe;color:#374151;background:#f8fafc}
.want{margin:0 0 8px}ul{margin:0 0 10px;padding-left:18px}li.pass{color:#15803d}li.fail{color:#b91c1c}li.man{color:#6b7280}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:0}figcaption{font-size:12px;color:#6b7280;margin-bottom:4px}
img{width:100%;border:1px solid #e5e7eb;border-radius:8px}.nof{padding:40px;text-align:center;color:#9ca3af;border:1px dashed #d1d5db;border-radius:8px}
b.pass{color:#fff;background:#16a34a}b.fail{color:#fff;background:#dc2626}b.err{color:#fff;background:#9333ea}b.man{color:#fff;background:#6b7280}
b.pass,b.fail,b.err,b.man{font-size:11px;padding:2px 7px;border-radius:999px;margin-right:4px}.errline{color:#7e22ce}
@media(max-width:900px){.pair{grid-template-columns:1fr}}
</style>
<h1>Charlene's Oct 10 recording vs. the live app</h1>
<p>${new Date().toLocaleString()} · ${esc(cfg.url)} · ${WRITE ? 'read + write mode' : 'read-only mode'} ·
${results.filter((r) => !r.error && !r.checks.some((c) => c.pass === false) && r.checks.some((c) => c.pass)).length} pass,
${results.filter((r) => r.checks.some((c) => c.pass === false)).length} fail,
${results.filter((r) => r.error).length} script errors${skipped.length ? `, ${skipped.length} booking checkpoints skipped (run with --write)` : ''}</p>
${rows}`;
writeFileSync(join(OUT, 'report.html'), html);
console.log(`\nReport: ${join(OUT, 'report.html')}`);
