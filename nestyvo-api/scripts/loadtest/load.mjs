// Simulated traffic for the load test (Oct 19 2026). Each virtual user logs
// in with the password the seed set, then works the app the way the screens
// do: agents load the dashboard, open a provider's month, open a day, search
// clients, and sometimes book then reschedule or cancel; providers open My
// Schedule and the month's open times. `pace` divides the pauses between
// clicks: 1 = normal people, 3 = three times as busy, and so on.
//
//   node scripts/loadtest/load.mjs <baseUrl> <password> <seconds> <pace> [agents] [providers]

const [, , BASE, PASSWORD, SECONDS = '180', PACE = '1', AGENTS = '5', PROVIDERS = '50'] = process.argv;
const API = `${BASE.replace(/\/$/, '')}/api/v1`;
const pace = Number(PACE);
const endAt = Date.now() + Number(SECONDS) * 1000;
// People sign in spread over the first minute (WARMUP seconds), and only
// requests after that are measured, so the result is steady-state use.
const WARMUP = Number(process.env.WARMUP ?? 0);
const measureFrom = Date.now() + WARMUP * 1000;

const stats = new Map(); // label -> { ms: [], errors: 0, codes: {} }
function record(label, ms, status) {
  if (label !== 'login' && Date.now() < measureFrom) return;
  const s = stats.get(label) ?? { ms: [], errors: 0, codes: {} };
  s.ms.push(ms);
  s.codes[status] = (s.codes[status] ?? 0) + 1;
  if (status >= 400 || status === 0) s.errors++;
  stats.set(label, s);
}
async function call(label, token, method, path, body) {
  const t0 = performance.now();
  let status = 0, data = null;
  try {
    const res = await fetch(API + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    status = res.status;
    const text = await res.text();
    try { data = JSON.parse(text); } catch { data = text; }
  } catch { status = 0; }
  record(label, performance.now() - t0, status);
  return { status, data };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const think = (lo, hi) => sleep(((lo + Math.random() * (hi - lo)) * 1000) / pace);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const isoDay = (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
function monthRange(offset) {
  const now = new Date();
  const y = now.getUTCFullYear(), m = now.getUTCMonth() + offset;
  const from = new Date(Date.UTC(y, m, 1 - 7)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(y, m + 1, 7)).toISOString().slice(0, 10);
  return { from, to };
}
const NAMES = ['Gonzalez', 'Kim', 'Johnson', 'Rivera', 'Walsh', 'Nguyen', 'Patel', 'Brooks', 'Lopez', 'Reed'];

async function login(email) {
  const { status, data } = await call('login', null, 'POST', '/auth/login', { email, password: PASSWORD });
  if (status >= 300) throw new Error(`login ${email} -> ${status}`);
  return data.accessToken || data.access_token || data.token;
}

async function agent(i) {
  const token = await login(`load-agent-${i}@loadtest.local`);
  const poll = setInterval(() => call('tickets (60s poll)', token, 'GET', '/tickets'), 60_000);
  while (Date.now() < endAt) {
    const { data: dash } = await call('agent dashboard', token, 'GET', '/dashboard/agent');
    await think(3, 8);
    const prov = pick(dash?.providers ?? []);
    if (!prov) continue;
    const { from, to } = monthRange(Math.floor(Math.random() * 12));
    const { data: month } = await call('calendar month', token, 'GET', `/dashboard/agent?providerId=${prov.id}&from=${from}&to=${to}`);
    const days = month?.providers?.[0]?.slotsByDate ?? [];
    await think(2, 5);
    const day = pick(days);
    if (day) await call('day schedule', token, 'GET', `/providers/${prov.id}/schedule?date=${day.date}`);
    await think(3, 8);
    if (Math.random() < 0.3 || (day && Math.random() < 0.25)) {
      const { data: found } = await call('client search', token, 'GET', `/patients?q=${pick(NAMES)}`);
      await think(2, 5);
      const list = Array.isArray(found) ? found : found?.items ?? found?.data ?? [];
      const patient = list.find((p) => p.practiceName === prov.practiceName);
      if (day && patient && Math.random() < 0.6) {
        const slot = pick(day.slots);
        const { status, data: appt } = await call('book appointment', token, 'POST', `/providers/${prov.id}/appointments`, {
          patientId: patient.id, startAt: slot.startAt, endAt: slot.endAt, locationType: 'in_person',
        });
        await think(2, 5);
        if (status < 300 && appt?.id) {
          const other = pick(days.filter((d) => d.date !== day.date)) ?? day;
          const s2 = pick(other.slots);
          if (Math.random() < 0.5 && s2 && s2.startAt !== slot.startAt) {
            await call('reschedule', token, 'PATCH', `/providers/${prov.id}/appointments/${appt.id}/reschedule`, { newStartAt: s2.startAt, newEndAt: s2.endAt });
          } else {
            await call('cancel', token, 'PATCH', `/providers/${prov.id}/appointments/${appt.id}/cancel`, { reason: 'load test' });
          }
        }
      }
    }
    await think(3, 8);
  }
  clearInterval(poll);
}

async function provider(i) {
  const token = await login(`load-provider-${i}@loadtest.local`);
  while (Date.now() < endAt) {
    await call('provider my schedule', token, 'GET', '/dashboard/provider?scheduleDays=548');
    await think(3, 8);
    const { from, to } = monthRange(Math.random() < 0.6 ? 0 : Math.floor(Math.random() * 12));
    await call('provider open times', token, 'GET', `/dashboard/provider/available-slots?from=${from}&to=${to}`);
    await think(15, 45);
  }
}

const pct = (a, p) => a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];
const t0 = Date.now();
const users = [
  ...Array.from({ length: Number(AGENTS) }, (_, k) => sleep(Math.random() * Math.max(WARMUP, 5) * 1000).then(() => agent(k + 1))),
  ...Array.from({ length: Number(PROVIDERS) }, (_, k) => sleep(Math.random() * Math.max(WARMUP, 5) * 1000).then(() => provider(k + 1))),
];
const results = await Promise.allSettled(users);
const failed = results.filter((r) => r.status === 'rejected');
const secs = (Date.now() - t0) / 1000;
let total = 0, errs = 0;
const rows = [...stats.entries()].map(([label, s]) => {
  const ms = s.ms.sort((a, b) => a - b);
  total += ms.length; errs += s.errors;
  return { label, n: ms.length, p50: Math.round(pct(ms, 50)), p95: Math.round(pct(ms, 95)), p99: Math.round(pct(ms, 99)), max: Math.round(ms.at(-1)), errors: s.errors, codes: s.codes };
});
console.log(JSON.stringify({ pace, seconds: Math.round(secs), agents: Number(AGENTS), providers: Number(PROVIDERS), requests: total, reqPerSec: +(total / secs).toFixed(2), errors: errs, userFailures: failed.map((f) => String(f.reason).slice(0, 120)), rows }, null, 1));
