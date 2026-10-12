// Charlene's Oct 11 "Full Pass" recording (two files, treated as one pass:
// "Full Pass Part 1 .mp4" + "Full Pass Part 2.mp4"), replayed against the live
// app. One checkpoint per thing she checked or asked for, keyed to the part and
// timestamp where she says it. Run with:
//
//   npm run compare -- --set fullpass            # read-only
//   npm run compare -- --set fullpass --write    # also the booking / request round trips
//
// h.check() = automatic pass/fail, h.open() = an item already reported as
// still outstanding (amber, not a regression), h.note() = compare the
// screenshots by eye. Provider checkpoints run as the dedicated "Playwright
// Test" provider (Charlene was signed in as Gloria); admin ones look at
// Gloria's real calendar read-only, like the Oct 10 set.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHECKPOINTS as OCT10, PROVIDER_HOME, ADMIN_HOME, adminCalendarForProvider,
} from './checkpoints.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const META = {
  title: 'Charlene\'s "Full Pass" recording (Oct 11) vs. the live app',
  intro: 'Both parts of the recording treated as one pass. Amber <b>OPEN</b> = already on the outstanding list, not a regression.',
  videos: { P1: join(ROOT, 'Full Pass Part 1 .mp4'), P2: join(ROOT, 'Full Pass Part 2.mp4') },
  // 1920×1080 Meet screen-share: the Chrome window (URL bar → tab bar) sits top-left.
  crop: 'crop=1425:686:12:192',
};

const oct10 = (id) => OCT10.find((c) => c.id === id);
const sleep = (h, ms) => h.page.waitForTimeout(ms);
const backArrow = async (h) => { await h.page.mouse.click(28, 30); await sleep(h, 2000); };
const path = (h) => new URL(h.page.url()).pathname;

/** Boxes of in-viewport elements whose own text (not children's) matches — for labels a touchable overlays. */
async function ownText(h, source) {
  return h.page.evaluate((src) => {
    const re = new RegExp(src, 'i'); const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
      if (!own || !re.test(own)) continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.height && r.top >= 0 && r.top < innerHeight && getComputedStyle(el).visibility !== 'hidden')
        out.push({ text: own, x: r.left + Math.min(r.width / 2, 40), y: r.top + r.height / 2 });
    }
    return out;
  }, source);
}

async function tab(h, name) {
  const el = await h.firstOnTop(h.page.getByText(name, { exact: true }));
  if (!el) throw new Error(`"${name}" tab not on screen`);
  await el.click();
  await sleep(h, 2000);
}

/** The test client, as the API knows it (admin roster). */
async function testClient(h) {
  const r = await h.api('GET', '/patients/roster', null, 'admin');
  const [first, ...rest] = h.cfg.testClient.split(' ');
  const all = [...(r.body?.active ?? []), ...(r.body?.inactive ?? [])];
  return all.find((p) => p.firstName === first && p.lastName === rest.join(' '));
}

/** Provider: Clients tab → the test client's profile (checks both Active and Inactive). */
async function openTestClientAsProvider(h) {
  await PROVIDER_HOME(h);
  await tab(h, 'Clients');
  const label = h.cfg.testClient.split(' ').reverse().join(', ');
  let tile = await h.firstOnTop(h.page.getByText(label, { exact: false }));
  if (!tile) {
    await (await h.firstOnTop(h.page.getByText(/^inactive/i)))?.click();
    await sleep(h, 1500);
    tile = await h.firstOnTop(h.page.getByText(label, { exact: false }));
  }
  if (!tile) throw new Error(`${h.cfg.testClient} not in the provider's client list`);
  await tile.click();
  await sleep(h, 3000);
}

/** Admin: Clients tab → search → open the named client. */
async function openClientAsAdmin(h, name) {
  await ADMIN_HOME(h);
  await tab(h, 'Clients');
  const search = await h.firstOnTop(h.page.getByPlaceholder(/Search/));
  await search?.fill(name.split(' ')[0]);
  await sleep(h, 1500);
  await h.click(name, { exact: false });
  await sleep(h, 2000);
}

/** Provider id of the test provider, and a future scheduled appointment of theirs (if any). */
async function providerAndNextAppt(h) {
  const self = (await h.api('GET', '/providers/self', null, 'provider')).body;
  for (let i = 1; i <= 21; i++) {
    const d = new Date(Date.now() + i * 86_400_000).toISOString().slice(0, 10);
    const s = (await h.api('GET', `/providers/${self.id}/schedule?date=${d}`, null, 'provider')).body;
    const rows = Array.isArray(s) ? s : s?.appointments ?? s?.items ?? [];
    const a = rows.find((r) => r.source === 'nestyvo' && r.status === 'scheduled' && new Date(r.startAt) > new Date());
    if (a) return { self, appt: a };
  }
  return { self, appt: null };
}

export const CHECKPOINTS = [
  // ---------------------------------------------------------------- Part 1
  {
    id: 'F01', part: 'P1', ts: '00:00:52', role: 'provider', title: 'Booked dots don\'t count recurring blocks',
    quote: 'It\'s the blue is accounting every day booked because it\'s showing a recurring event… But that doesn\'t mean… So, the green is what is booked.',
    expect: 'A blue "Booked" dot only on days with a real appointment; blocked time alone adds no dot.',
    async run(h) {
      await PROVIDER_HOME(h);
      // Days the grid marks as booked vs days that really have appointments.
      const { self } = await providerAndNextAppt(h);
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      let blockOnly = 0;
      for (let d = now.getDate(); d <= days; d++) {
        const iso = `${month}-${String(d).padStart(2, '0')}`;
        const s = (await h.api('GET', `/providers/${self.id}/schedule?date=${iso}`, null, 'provider')).body;
        const rows = (Array.isArray(s) ? s : s?.appointments ?? []).filter((r) => r.startAt?.slice(0, 10) === iso);
        if (rows.some((r) => r.source === 'block') && !rows.some((r) => r.source !== 'block')) blockOnly++;
      }
      h.note('Compare the dots with the frame: blue should sit only under days with a real appointment',
        `${blockOnly} day(s) left this month have only blocked time — those must show no blue dot`);
    },
  },
  {
    id: 'F02', part: 'P1', ts: '00:01:16', role: 'provider', title: 'Arrow to December, click a date',
    quote: 'Use the arrow to move to December and click a date. December 23rd. Okay… No appointments there. Perfect.',
    expect: 'The month arrow reaches December and selecting the 23rd shows that day.',
    async run(h) {
      await PROVIDER_HOME(h);
      const y = new Date().getFullYear();
      for (let i = 0; i < 12 && !(await h.has(`December ${y}`, { timeout: 500 })); i++) {
        const title = h.page.getByText(new RegExp(`^(January|February|March|April|May|June|July|August|September|October|November) ${y}$`)).first();
        await title.locator('xpath=following-sibling::*[1]').click();
        await sleep(h, 400);
      }
      h.check('Reached December', await h.has(`December ${y}`));
      const cell = await h.firstOnTop(h.page.getByText('23', { exact: true }));
      await cell?.click();
      await sleep(h, 1200);
      h.check('December 23 selected (day panel shows it)', await h.has(`December 23, ${y}`));
    },
  },
  {
    ...oct10('C12'), id: 'F03', part: 'P1', ts: '00:01:56', frameAt: '00:02:00',
    title: 'Book from an open time → "Back to Calendar"',
    quote: 'Choose a new client here… Let\'s do a 9:00… existing client… green frog on the 21st at 9… consult. Confirm the booking… and then we\'re going to hit back to calendar.',
  },
  {
    id: 'F04', part: 'P1', ts: '00:02:44', role: 'provider', title: '"+ Book a different time" is redundant',
    quote: 'It\'s just another way to book. I see. All right, that might be a little redundant. It looks like it\'s doing the same thing as this up here.',
    expect: 'Only one way to start a booking from the day panel (nit).',
    async run(h) {
      await PROVIDER_HOME(h);
      if (await h.has('Book a different time')) h.open('"+ Book a different time" still shown under Open Times', 'outstanding nit — not changed yet');
      else h.check('"+ Book a different time" removed', true);
    },
  },
  {
    id: 'F05', part: 'P1', ts: '00:02:56', role: 'provider', title: 'Reschedule from the picker; old time opens again',
    quote: 'Open an appointment, tap reschedule… Pick a new date and time from the picker the 30th… noon… Rescheduled Green Frog to Friday, October 30th at 12:00… The old time is open again.',
    expect: 'Reschedule uses the calendar + open-time picker (no typed fields).',
    async run(h) {
      await PROVIDER_HOME(h);
      const { appt } = await providerAndNextAppt(h);
      if (!appt) { h.note('The test provider has no upcoming appointment to open — run with --write (F03 books one) first.'); return; }
      const day = new Date(appt.startAt);
      if (day.getMonth() !== new Date().getMonth()) await h.page.getByText(/^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/).first().locator('xpath=following-sibling::*[1]').click();
      await (await h.firstOnTop(h.page.getByText(String(day.getDate()), { exact: true })))?.click();
      await sleep(h, 1200);
      await h.click(appt.patient, { exact: false });
      await h.click('Reschedule');
      await h.click('Pick a date & time', { exact: false });
      await sleep(h, 1000);
      h.check('No typed date field', (await h.page.getByPlaceholder(/YYYY-MM-DD/).count()) === 0);
      h.check('No typed 24-hour time field', (await h.page.getByPlaceholder(/HH:MM/).count()) === 0);
      h.check('Picker shows a month calendar', await h.has(/^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/));
    },
  },
  {
    id: 'F06', part: 'P1', ts: '00:04:16', role: 'admin', title: 'Admin calendar remembers the provider',
    quote: 'Go to the dashboard and then tap calendar again… It still brings me back to Gloria\'s… I just need to make sure that I\'m on the right provider calendar when I go back into it.',
    expect: 'Calendar → Gloria → Dashboard → Calendar is still on Gloria.',
    async run(h) {
      await adminCalendarForProvider(h);
      await tab(h, 'Dashboard');
      await tab(h, 'Calendar');
      h.check('Calendar still on Gloria after a trip to the Dashboard', await h.has(h.cfg.adminProviderName));
    },
  },
  {
    id: 'F07', part: 'P1', ts: '00:05:00', role: 'admin', title: 'Admin: client → appointment → Back returns to the client',
    quote: 'Tap one of their appointments… Expect back to that client\'s page… Back. Okay. So, we\'re back to the Brown Bears page. Perfect.',
    expect: 'Back from an appointment opened on a client page lands on that client page.',
    async run(h) {
      await openClientAsAdmin(h, 'Brown Bear');
      const clientPath = path(h);
      const row = await h.firstOnTop(h.page.getByText(/^(scheduled|cancelled|completed|rescheduled|no.show)$/i));
      if (!row) { h.note('Brown Bear has no appointment rows to open right now'); return; }
      await row.click();
      await sleep(h, 2000);
      h.check('Opened the appointment', path(h) !== clientPath, path(h));
      await backArrow(h);
      h.check('Back landed on Brown Bear\'s page', path(h) === clientPath && (await h.has('Brown Bear')), path(h));
    },
  },
  {
    id: 'F08', part: 'P1', ts: '00:06:24', role: 'provider', title: 'Overlapping booking is refused',
    quote: 'I want to do a business tax filing for 90 minutes. Oh, overlaps time. Now, let\'s change it to a 45 minute consult… that was a great little popup.',
    expect: 'A booking that overlaps an existing appointment is rejected (409) and nothing is created.',
    write: true,
    async run(h) {
      const { self, appt } = await providerAndNextAppt(h);
      if (!appt) { h.note('No upcoming appointment to overlap with (F03 books one with --write).'); return; }
      const client = await testClient(h);
      const start = new Date(new Date(appt.startAt).getTime() + 15 * 60_000);
      const r = await h.api('POST', `/providers/${self.id}/appointments`, {
        patientId: client.id, locationType: 'virtual', startAt: start.toISOString(), endAt: new Date(start.getTime() + 90 * 60_000).toISOString(),
      });
      if (r.status < 300 && r.body?.id) {
        await h.api('PATCH', `/providers/${self.id}/appointments/${r.body.id}/cancel`, { reason: 'Playwright overlap check cleanup' });
      }
      h.check('Overlapping 90-minute booking rejected', r.status === 409, `HTTP ${r.status}${r.body?.message ? ` — ${r.body.message}` : ''}`);
    },
  },
  {
    id: 'F09', part: 'P1', ts: '00:07:52', role: 'provider', title: 'Request round trip: provider → admin → provider → resolved',
    quote: 'Send request… the request appears in her list… [admin] I got a new request… Called and left message… in progress… [Gloria] Charlene marked it as progress… Reply… [admin] resolve… [Gloria] they marked it resolved. Perfect.',
    frameAt: '00:10:56',
    expect: 'Each side sees the other\'s notes in order and the provider sees it Resolved.',
    write: true,
    async run(h) {
      const client = await testClient(h);
      const stamp = new Date().toISOString().slice(11, 19);
      const subject = `Playwright Full Pass ${stamp}`;
      const t = await h.api('POST', '/tickets', {
        patientId: client.id, category: 'outbound_call', subject, description: 'Please call and let them know. (automated test)',
      });
      h.check('Provider can file a request for her client', t.status < 300 && t.body?.id, `HTTP ${t.status}`);
      if (!t.body?.id) return;
      const adminList = await h.api('GET', '/tickets?status=open', null, 'admin');
      h.check('Admin sees it in the open list', (adminList.body ?? []).some((x) => x.id === t.body.id));
      await h.api('PATCH', `/tickets/${t.body.id}`, { replyText: 'Called and left message', status: 'in_progress' }, 'admin');
      await h.api('PATCH', `/tickets/${t.body.id}`, { replyText: 'Cancel. We don\'t need it.' });
      const mid = (await h.api('GET', `/tickets/${t.body.id}`)).body;
      const notes = mid?.resolutionNotes ?? '';
      h.check('Both notes kept, in order (no overwrite)',
        notes.indexOf('Called and left message') >= 0 && notes.indexOf('Called and left message') < notes.indexOf('We don\'t need it'));
      await h.api('PATCH', `/tickets/${t.body.id}`, { status: 'resolved' }, 'admin');
      // Provider UI: Requests → Resolved filter shows it
      await PROVIDER_HOME(h);
      await tab(h, 'Requests');
      await h.click('Resolved', { exact: true }).catch(() => {});
      await sleep(h, 1500);
      h.check('Provider sees it under Resolved', await h.has(subject));
      await h.click(subject, { exact: false }).catch(() => {});
      await sleep(h, 1200);
      h.check('Resolved request shows the full history', await h.has('Called and left message') && await h.has('We don\'t need it'));
    },
  },
  {
    id: 'F10', part: 'P1', ts: '00:08:12', role: 'admin', title: 'Admin request counter',
    quote: 'Admin here. Okay. I got a new request… Now, I have one more flag counter.',
    expect: 'The admin Requests (flag) icon shows the open-request count.',
    async run(h) {
      await ADMIN_HOME(h);
      const open = (await h.api('GET', '/tickets?status=open')).body ?? [];
      const prog = (await h.api('GET', '/tickets?status=in_progress')).body ?? [];
      const txt = (await h.page.getByTestId('nav-requests').innerText().catch(() => '')).trim();
      if (open.length + prog.length === 0) h.check('No open requests → no badge', !/\d/.test(txt), txt || 'no badge');
      else h.check('Flag icon shows a count badge', /\d/.test(txt), `badge "${txt}", ${open.length} open + ${prog.length} in progress`);
    },
  },
  {
    id: 'F11', part: 'P1', ts: '00:09:16', role: 'provider', title: 'Request list shows what changed',
    quote: 'Charlene marked it as progress. It doesn\'t say what. Let me click on it. Okay. Here we go. Now it shows called and left a message.',
    expect: 'The request row previews the latest note, not just the status change (nit).',
    async run(h) {
      await PROVIDER_HOME(h);
      await tab(h, 'Requests');
      h.open('Row preview still shows the status line, not the latest note', 'outstanding nit');
    },
  },
  {
    id: 'F12', part: 'P1', ts: '00:09:48', role: 'admin', title: 'Reply / Resolve closes the request on its own',
    quote: 'Maybe once you reply or resolve or close that maybe this just closes without having to hit close and then you can see it here.',
    expect: 'After Reply or Resolve the detail closes and the list shows the change (nit).',
    async run(h) {
      await ADMIN_HOME(h);
      h.open('Detail still stays open after Reply/Resolve until Close is tapped', 'outstanding nit');
    },
  },
  {
    id: 'F13', part: 'P1', ts: '00:11:40', role: 'admin', title: 'Recurring blocks listed once, with "Remove all"',
    quote: 'Hours, blocks, and calendars down here. Look at the upcoming blocks… [P2] the recurring block times. 1:45 to 3:45. And then you can remove all. That\'s good.',
    expect: 'One row per recurring block with a "Remove all" action.',
    async run(h) {
      const provs = (await h.api('GET', '/providers')).body ?? [];
      const gl = provs.find((p) => `${p.firstName} ${p.lastName}` === h.cfg.adminProviderName && p.practiceId && p.status !== 'inactive');
      if (!gl) throw new Error('Gloria not found in /providers');
      await ADMIN_HOME(h);
      await h.page.goto(`${h.cfg.url}/provider-settings?practiceId=${gl.practiceId}&providerId=${gl.id}`, { waitUntil: 'networkidle' });
      await sleep(h, 2500);
      await h.page.getByText(/^Upcoming blocks/).first().scrollIntoViewIfNeeded().catch(() => {});
      await sleep(h, 600);
      const head = (await h.visibleText()).match(/Upcoming blocks \(([^)]*)\)/);
      h.check('Upcoming blocks section shown', !!head, head?.[0] ?? '');
      h.check('Recurring block offers "Remove all"', await h.has('Remove all'));
    },
  },

  // ---------------------------------------------------------------- Part 2
  {
    id: 'F14', part: 'P2', ts: '00:01:20', role: 'admin', title: 'Client page: tag, large dates, cancel shows without refresh',
    quote: 'Change their client tag… Then look at the recent appointment… The date is showing large. That\'s great… cancel their upcoming appointment… The client\'s page shows us canceled without a refresh.',
    expect: 'Client Tag on the page; appointment dates large; cancellations reflected immediately.',
    async run(h) {
      await openClientAsAdmin(h, 'Brown Bear');
      h.check('Client Tag section on the client page', await h.has('Client Tag'));
      h.note('Compare the appointment date size with the frame.');
    },
  },
  {
    id: 'F15', part: 'P2', ts: '00:04:28', role: 'admin', title: 'CSV import creates missing tags',
    quote: 'Import clients… Apply to imported clients. Starts in 60 minutes… Search for one of the imported clients right away and open them… That worked perfect.',
    expect: 'Unknown tag names in the CSV become tags for that provider and are applied.',
    async run(h) {
      const r = await h.api('GET', '/patients/roster');
      const names = ['Sophia', 'Ned', 'Bella'];
      const all = [...(r.body?.active ?? []), ...(r.body?.inactive ?? [])];
      const found = names.filter((n) => all.some((p) => p.firstName === n));
      h.check('Her test-import clients exist', found.length > 0, `found: ${found.join(', ') || 'none'}`);
    },
  },
  {
    id: 'F16', part: 'P2', ts: '00:05:00', role: 'admin', title: 'Edit a tag\'s time length',
    quote: 'We can edit them if we need to manage tags… I just can\'t edit the time length, but that\'s okay. We could work around that for now.',
    expect: 'A tag\'s Smart Fill minutes can be changed after it is created.',
    async run(h) {
      await ADMIN_HOME(h);
      h.open('No edit UI for a tag\'s minutes yet (the API supports it)', 'outstanding — she said OK to work around for now');
    },
  },
  { ...oct10('C01'), id: 'F17', part: 'P2', ts: '00:05:20', title: 'Login screen — HIPAA text removed',
    quote: 'Login screen. HIPAA compliant was removed. I believe I saw that… Log out. Yes, that\'s great.' },
  { ...oct10('C03'), id: 'F18', part: 'P2', ts: '00:05:28', title: 'New client form — no Headway',
    quote: 'New client form. The referral field no longer mentions Headway. I did observe that.' },
  {
    id: 'F19', part: 'P2', ts: '00:06:04', role: 'provider', title: 'Waitlist wording: clients, not patients',
    quote: 'Waitlist clients waiting. No clients on waitlist and a new client reason instead of patient… My client six clients waiting.',
    expect: 'Provider and admin waitlists say client; type labels read "New Client".',
    async run(h) {
      await PROVIDER_HOME(h);
      await tab(h, 'Waitlist');
      const vt = await h.visibleText();
      h.check('Provider waitlist: no "patient"', !/patient/i.test(vt), (vt.match(/[^\n]*patient[^\n]*/i) || [''])[0]);
      const admin = await h.api('GET', '/dashboard/agent/waitlist', null, 'admin');
      h.check('Admin waitlist data loads', admin.status === 200, `${admin.body?.length ?? 0} entries`);
    },
  },
  {
    id: 'F20', part: 'P2', ts: '00:06:12', role: 'provider', title: 'Provider waitlist rows open the client',
    quote: 'Look, you can\'t click on from the provider login in the wait list… I want to see what let\'s say Jane Doe. I just can\'t open it. I can only close her out.',
    expect: 'Tapping a waitlist row opens that client\'s profile.',
    async run(h) {
      let mine = (await h.api('GET', '/waitlist/mine')).body ?? [];
      let added = null;
      if (!mine.length && h.WRITE) {
        const c = await testClient(h);
        added = (await h.api('POST', '/waitlist', { patientId: c.id, waitlistType: 'followup', notes: 'Playwright Full Pass check' })).body;
        mine = (await h.api('GET', '/waitlist/mine')).body ?? [];
      }
      if (added?.id) h.cleanup(async () => { await h.api('DELETE', `/waitlist/${added.id}`); });
      if (!mine.length) { h.note('The test provider\'s waitlist is empty — run with --write to add a temporary entry.'); return; }
      await PROVIDER_HOME(h);
      await tab(h, 'Waitlist');
      const name = mine[0].patient; // "First Last" on /waitlist/mine
      await h.click(name, { exact: false });
      h.check('Row opened the client profile', /\/clients\//.test(path(h)), path(h));
      h.check('Profile shows the client', await h.has('Details'));
    },
  },
  {
    id: 'F21', part: 'P2', ts: '00:06:40', role: 'admin', title: 'Admin waitlist: client opens, Back returns',
    quote: 'Admin, we clicked wait list. Uh, you can\'t click on the client.',
    expect: 'Client name opens the profile; Back returns to the Waitlist.',
    async run(h) {
      const wl = (await h.api('GET', '/dashboard/agent/waitlist')).body ?? [];
      if (!wl.length) { h.note('Admin waitlist is empty'); return; }
      await ADMIN_HOME(h);
      await h.page.goto(`${h.cfg.url}/waitlist`, { waitUntil: 'networkidle' });
      await sleep(h, 2500);
      const head = (await ownText(h, '\\d+ \\w+ waiting')).map((t) => t.text);
      h.check('Says "clients waiting"', head.some((t) => /clients? waiting/.test(t)) && !head.some((t) => /patient/i.test(t)), head[0] ?? 'no count line');
      await h.click(wl[0].patient.name, { exact: true });
      await sleep(h, 1500);
      h.check('Name opens the client profile', /\/patients\//.test(path(h)), path(h));
      await backArrow(h);
      h.check('Back returns to the Waitlist', /\/waitlist\/?$/.test(path(h)), path(h));
    },
  },
  {
    id: 'F22', part: 'P2', ts: '00:07:24', role: 'admin', title: 'Smart Fill: future slots only, and why it matched',
    quote: 'How is it determining what data… The smart fill looks like it\'s working. I just don\'t know what logic it\'s showing to suggest this wait list… maybe you can see a preview of what it is they\'re waiting for.',
    expect: 'No suggestion points at a slot in the past; each says why it matched.',
    async run(h) {
      const wl = (await h.api('GET', '/dashboard/agent/waitlist')).body ?? [];
      const matched = wl.filter((e) => e.matchingCancellation);
      const past = matched.filter((e) => new Date(e.matchingCancellation.slotStartAt) <= new Date());
      h.check('No match points at a past slot', past.length === 0, `${matched.length} matched, ${past.length} in the past`);
      await ADMIN_HOME(h);
      await h.page.goto(`${h.cfg.url}/waitlist`, { waitUntil: 'networkidle' });
      await sleep(h, 2500);
      h.open('Matches don\'t yet use preferred days/times or explain why', 'outstanding — needs Charlene\'s input on the rule');
    },
  },
  {
    id: 'F23', part: 'P2', ts: '00:08:00', role: 'admin', title: 'Import is locked to the provider you came from',
    quote: 'If I\'m in Gloria\'s and I\'m going to import, it should default to where we were at… I shouldn\'t be able to select Peace of Mind.',
    expect: '"Importing into: Tax Refund 1040 · Gloria Ortiz" with no practice/provider pickers.',
    async run(h) {
      const provs = (await h.api('GET', '/providers')).body ?? [];
      const gl = provs.find((p) => `${p.firstName} ${p.lastName}` === h.cfg.adminProviderName && p.practiceId && p.status !== 'inactive');
      await ADMIN_HOME(h);
      await h.page.goto(`${h.cfg.url}/import-clients?presetPracticeId=${gl.practiceId}&presetProviderId=${gl.id}&presetProviderName=${encodeURIComponent(h.cfg.adminProviderName)}`, { waitUntil: 'networkidle' });
      await sleep(h, 2500);
      const vt = await h.visibleText();
      h.check('Shows "Importing into …"', vt.includes('Importing into'), (vt.match(/Importing into\n[^\n]*/) || [''])[0].replace('\n', ': '));
      h.check('No practice or provider picker', !vt.includes('Business / Practice') && !vt.includes('Provider (optional)'));
    },
  },
  {
    id: 'F24', part: 'P2', ts: '00:08:20', role: 'admin', title: 'Duplicate Gloria deactivated',
    quote: 'There\'s a second Gloria under a practice spelled tax refund 1040 no spaces… Yes, let\'s deactivate that.',
    expect: 'Only one active Gloria Ortiz.',
    async run(h) {
      const provs = (await h.api('GET', '/providers')).body ?? [];
      const glorias = provs.filter((p) => p.firstName === 'Gloria');
      const active = glorias.filter((p) => p.status !== 'inactive' && p.isActive !== false);
      h.check('One active Gloria', active.length === 1, `${glorias.length} total, ${active.length} active — Charlene said she\'d deactivate the duplicate herself`);
    },
  },
  {
    id: 'F25', part: 'P2', ts: '00:09:04', role: 'provider', title: 'Cancellations card piling up',
    quote: 'What are we doing with cancellations? It just is it racking up or does it delete?… maybe we figure out a way that that doesn\'t look like you have to address it… Let\'s leave that as is.',
    expect: '(Not for now.) The provider Cancellations count shouldn\'t read like a to-do.',
    async run(h) {
      await PROVIDER_HOME(h);
      h.open('Cancellations card unchanged', 'she said leave as is for the pilot');
    },
  },
  {
    id: 'F26', part: 'P2', ts: '00:09:32', role: 'admin', title: 'Imported clients are Active',
    quote: 'It shows inactive and this was an import that we just did… When the clients are imported, they should not be moved as an inactive.',
    expect: 'Cynthia Aguilar and Liam Anderson (imported, nothing booked yet) are Active.',
    async run(h) {
      const r = (await h.api('GET', '/patients/roster')).body ?? {};
      for (const [f, l] of [['Cynthia', 'Aguilar'], ['Liam', 'Anderson']]) {
        const active = (r.active ?? []).some((p) => p.firstName === f && p.lastName === l);
        const inactive = (r.inactive ?? []).some((p) => p.firstName === f && p.lastName === l);
        h.check(`${f} ${l} is Active`, active, inactive ? 'still Inactive' : active ? '' : 'not found');
      }
    },
  },
  {
    id: 'F27', part: 'P2', ts: '00:09:52', role: 'provider', title: 'Provider client profile: edit, tag, history',
    quote: 'If I click on Olivia Bennett, for example, I should be able to edit all her profile, her tag, and just see her history from here.',
    frameAt: '00:09:54',
    expect: 'Details (editable), Client Tag, Appointments and request history on the provider\'s client page.',
    async run(h) {
      await openTestClientAsProvider(h);
      const vt = await h.visibleText();
      for (const s of ['Details', 'Client Tag', 'Appointments', 'Requests & interaction history']) {
        h.check(`"${s}" section`, vt.includes(s) || (await h.has(s)));
      }
      h.check('Edit button on Details', await h.has('Edit', { exact: true }));
    },
  },
  {
    id: 'F28', part: 'P2', ts: '00:10:28', role: 'provider', title: 'Back from a client goes to the client list',
    quote: 'Now, look, when I hit back, it takes me back to the homepage… I should go back to the client list, not to the master home.',
    expect: 'Back on a provider client page lands on Clients.',
    async run(h) {
      await openTestClientAsProvider(h);
      await backArrow(h);
      h.check('Back landed on the client list', /\/clients\/?$/.test(path(h)), path(h));
    },
  },
  {
    id: 'F29', part: 'P2', ts: '00:11:16', role: 'provider', title: 'Requests appears twice',
    quote: 'Looks like we have requests duplicated. We have requests here. Request here. And that\'s okay.',
    expect: '(She\'s fine with it.) Requests in both the stat card and the tab bar.',
    async run(h) {
      await PROVIDER_HOME(h);
      h.note('She said it\'s okay — compare by eye.');
    },
  },
  {
    id: 'F30', part: 'P2', ts: '00:11:32', role: 'provider', title: 'Calendar view switcher (week view)',
    quote: 'Here\'s where you can change your calendar view. If I just want to see my week, I can click on these guys… This is a great starting point.',
    expect: 'Calendar offers Month / Week / Day views.',
    async run(h) {
      await PROVIDER_HOME(h);
      await h.page.mouse.click(1217, 40); // calendar icon (see C14)
      await sleep(h, 1500);
      h.check('Opened the provider Calendar', await h.has('Your schedule'));
      // The segmented control's label sits under its touchable, so locate by the visible label's box.
      const week = (await ownText(h, '^Week$'))[0];
      h.check('Week view offered', !!week);
      if (!week) return;
      await h.page.mouse.click(week.x, week.y);
      await sleep(h, 2000);
      h.check('Week view shows day headings', /(sunday|monday|tuesday|wednesday|thursday|friday|saturday), [a-z]{3} \d+/i.test(await h.visibleText()));
      h.note('Her frame shows a blue dot under every day of the week strip (recurring block). Compare: dots should follow real appointments only.');
    },
  },
];
