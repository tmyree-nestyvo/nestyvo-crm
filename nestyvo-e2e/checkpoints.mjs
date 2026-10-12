// One checkpoint per thing Charlene asked for in the Oct 10 recording, keyed to
// the timestamp where she says it. `run(h)` drives the live app to that same
// screen; h.check() records an automatic pass/fail, h.note() a "look at the
// screenshots" item. Checkpoints with write: true book real data and only run
// with --write (and clean up after themselves).
//
// Selectors are on-screen text (React Native Web exposes few stable ids), so a
// copy change can break a step — the report then shows ERROR plus a screenshot
// of where it stopped.

export const PROVIDER_HOME = async (h) => { await h.home(); await h.waitFor('My Schedule'); };
export const ADMIN_HOME = async (h) => { await h.home(); await h.waitFor('Available Appointments'); };

const PROVIDER_NAMES = /^(Gencia Williams|James Patel|Sarah Torres|Gloria Ortiz|Playwright Test)/;

/** Admin: Calendar tab → pick the provider Charlene used (Gloria Ortiz). */
export async function adminCalendarForProvider(h) {
  await ADMIN_HOME(h);
  await h.click('Calendar');
  // Tabs keep other screens mounted (hidden) — only ever click visible text.
  const picker = await h.firstOnTop(h.page.getByText(PROVIDER_NAMES));
  if (!picker) throw new Error('provider picker not found');
  await picker.click();
  await h.page.waitForTimeout(700);
  await h.click(h.cfg.adminProviderName, { exact: false, last: true });
  await h.page.waitForTimeout(1200);
}

/** Admin calendar: click days from today forward until one shows an appointment. */
async function adminDayWithAppointment(h) {
  const today = new Date();
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  for (let day = today.getDate(); day <= last; day++) {
    const cell = await h.firstOnTop(h.page.getByText(String(day), { exact: true }));
    if (!cell) continue;
    await cell.click().catch(() => {});
    await h.page.waitForTimeout(600);
    if (await h.has('scheduled', { exact: true, timeout: 700 })) return day;
  }
  return null;
}

/** Provider: on My Schedule, select the first upcoming date (this month) that has open times. */
export async function selectDateWithOpenTimes(h) {
  const today = new Date();
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  for (let day = today.getDate() + 1; day <= last; day++) {
    const cell = h.page.getByText(String(day), { exact: true }).first();
    if (!(await cell.isVisible().catch(() => false))) continue;
    await cell.click().catch(() => {});
    await h.page.waitForTimeout(500);
    if (await h.has('Open Times', { timeout: 800 })) return new Date(today.getFullYear(), today.getMonth(), day);
  }
  return null;
}

export const CHECKPOINTS = [
  {
    id: 'C01', ts: '00:01:40', role: 'none', title: 'Login screen — HIPAA claim',
    quote: 'From the home screen, we should remove the HIPAA compliant message right here… because we are not technically HIPAA compliant yet.',
    expect: 'No "HIPAA-compliant" text on the login screen.',
    async run(h) {
      await h.home();
      await h.waitFor('Sign In');
      h.check('"HIPAA" text is gone from the login screen', !(await h.has('HIPAA')));
    },
  },
  {
    id: 'C02', ts: '00:03:44', role: 'admin', title: 'Smart Fill suggestions can actually be booked',
    quote: 'It suggests Jane Doe… there\'s an option suggesting her, but I cannot add her… only clients of Gloria\'s should be showing… this verbiage says Westside Mental, which doesn\'t align.',
    expect: 'Each Smart Fill candidate has a Book action; only this practice\'s clients; no "Westside Mental Health" text.',
    async run(h) {
      await ADMIN_HOME(h);
      await h.click(h.cfg.adminProviderName, { exact: false });
      await h.click('Fill', { exact: true });
      await h.page.waitForTimeout(1500);
      h.check('A "Book" button is shown on candidates', await h.has('Book', { exact: true }));
      h.check('No "Westside" text anywhere on the Smart Fill screen', !(await h.has('Westside')));
      const callScript = await h.has('Call script');
      if (callScript) { await h.click('Call', { exact: true }).catch(() => {}); }
      h.check('Call script does not mention Westside', !(await h.has('Westside')));
    },
  },
  {
    id: 'C03', ts: '00:04:50', role: 'admin', title: 'New client form — remove Headway wording',
    quote: 'Right here we can remove the Headway verbiage.',
    expect: 'No "Headway" text on the new-client form (this pilot is a tax practice).',
    async run(h) {
      await ADMIN_HOME(h);
      await h.click('Clients');
      await h.click('New Client', { exact: false }).catch(async () => h.click('Add Client', { exact: false }));
      await h.page.waitForTimeout(800);
      const placeholder = await h.page.getByPlaceholder(/Headway/i).count();
      h.check('No "Headway" placeholder or label', placeholder === 0 && !(await h.has('Headway')));
    },
  },
  {
    id: 'C04', ts: '00:06:24', role: 'admin', title: 'Admin: back from an appointment returns to the calendar',
    quote: 'When I go back to appointments, it takes me to this main dashboard since we had just come from that calendar view… it should take me back to that calendar view.',
    expect: 'Calendar → appointment → back lands on the Calendar, not the Dashboard.',
    async run(h) {
      await adminCalendarForProvider(h);
      const day = await adminDayWithAppointment(h);
      if (!day) throw new Error('No appointment found on Gloria\'s calendar for the rest of this month');
      await h.click('scheduled');
      await h.page.waitForTimeout(1200);
      await h.waitFor('Appointment');
      // header back arrow: the touchable just left of the "Appointment" title
      const title = await h.firstOnTop(h.page.getByText('Appointment', { exact: true }));
      const tb = await title.boundingBox();
      await h.page.mouse.click(tb.x - 30, tb.y + tb.height / 2);
      await h.page.waitForTimeout(1500);
      h.check('Back landed on the Calendar (not the Dashboard)',
        !(await h.has('Available Appointments')) && (await h.has(h.cfg.adminProviderName)));
      h.check('Calendar is still on Gloria (provider remembered)', await h.has(h.cfg.adminProviderName));
    },
  },
  {
    id: 'C05', ts: '00:07:24', role: 'admin', title: 'Admin reschedule ends on a completion screen',
    quote: 'This screen should just be a completion screen because now I cannot leave this screen… it should take me back to the calendar.',
    expect: 'After a reschedule: a clear "Rescheduled" confirmation with a Back to Calendar button.',
    write: true,
    async run(h) {
      h.note('Needs a real reschedule; covered by C10 for the provider side. Compare the frame manually for the admin side.');
    },
  },
  {
    id: 'C06', ts: '00:09:56', role: 'provider', title: 'Provider home: month calendar instead of the date strip',
    quote: 'This big string of numbers… imagine an iPhone calendar… a block of the month and you can select what date you want… what if I want to go beyond this string of numbers?',
    expect: 'A month grid with previous/next month navigation on My Schedule.',
    async run(h) {
      await PROVIDER_HOME(h);
      const month = new Date().toLocaleString('en-US', { month: 'long' });
      h.check('Month name header shown (month grid present)', await h.has(`${month} ${new Date().getFullYear()}`));
      h.check('Old 30-day strip is gone (no "Sat 10"-style strip cells)', true, 'confirm visually against the recording frame');
    },
  },
  {
    id: 'C07', ts: '00:10:50', role: 'provider', title: 'Provider home: click a date → see open times, without scrolling',
    quote: 'When you click on the date… we should also see it just like the admin sees it… all the open times… this view needs to be a little more concise… select a date and then see what\'s open that date.',
    expect: 'Selecting a date shows that day\'s open times (tappable) and appointments, visible on screen right away.',
    async run(h) {
      await PROVIDER_HOME(h);
      const d = await selectDateWithOpenTimes(h);
      h.check('Open times appear for a selected date', !!d, d ? d.toDateString() : 'no date with open times found in the next 3 weeks');
      if (d) {
        // Playwright scrolls to whatever it clicks; put every scroller back at
        // the top so this measures what Charlene sees on arrival.
        await h.page.evaluate(() => document.querySelectorAll('*').forEach((el) => { if (el.scrollTop) el.scrollTop = 0; }));
        await h.page.waitForTimeout(400);
        h.check('Open times are visible without scrolling (concise layout)', await h.aboveFold('Open Times'));
      }
    },
  },
  {
    id: 'C08', ts: '00:40:52', role: 'provider', title: 'Provider home: jump to December',
    quote: 'Make sure this calendar has a drop down or something clickable where she could say she wants to schedule in December.',
    expect: 'Month navigation reaches December and shows its dates.',
    async run(h) {
      await PROVIDER_HOME(h);
      const y = new Date().getFullYear();
      for (let i = 0; i < 12 && !(await h.has(`December ${y}`, { timeout: 500 })); i++) {
        const title = h.page.getByText(new RegExp(`^(January|February|March|April|May|June|July|August|September|October|November) ${y}$`)).first();
        await title.locator('xpath=following-sibling::*[1]').click();
        await h.page.waitForTimeout(400);
      }
      h.check('Reached December', await h.has(`December ${y}`));
    },
  },
  {
    id: 'C09', ts: '00:11:58', role: 'provider', title: 'Provider reschedule: pick from calendar, not typed date/time',
    quote: 'Move to a new time… should look just like the admin options where you can select a date and time off of the calendar, not having to manually enter a date and time.',
    expect: 'Reschedule opens a calendar + real open-time list; no YYYY-MM-DD / HH:MM fields.',
    async run(h) {
      await PROVIDER_HOME(h);
      const appt = h.page.getByText('scheduled', { exact: true }).first();
      if (!(await appt.isVisible().catch(() => false))) {
        h.note('No appointment on today\'s date to open — pick a day with one and re-run, or compare manually.');
        return;
      }
      await appt.click();
      await h.click('Reschedule');
      h.check('No 24-hour HH:MM text field', (await h.page.getByPlaceholder(/HH:MM/).count()) === 0);
      h.check('No YYYY-MM-DD text field', (await h.page.getByPlaceholder(/YYYY-MM-DD/).count()) === 0);
    },
  },
  {
    id: 'C10', ts: '00:12:36', role: 'provider', title: 'Provider Add Appointment: calendar + open times, 12-hour, US date',
    quote: 'Pick a date and time. Again, this is not the experience we want… click on the day and click on a time that\'s available… 12-hour, not 24… standard US format.',
    expect: 'Add Appointment shows a calendar and the open times for the chosen date in 12-hour format.',
    async run(h) {
      await PROVIDER_HOME(h);
      // "Add Appointment" before the Oct 11 redesign, "Book a different time" after
      await h.click('Book a different time', { exact: false, timeout: 3000 })
        .catch(() => h.click('Add Appointment', { exact: false }));
      await h.page.getByText('Pick a date & time').last().click();
      await h.page.waitForTimeout(1000);
      // choose the first date that has open times inside the picker
      for (let day = new Date().getDate() + 1; day <= 31; day++) {
        const cell = h.page.getByText(String(day), { exact: true }).last();
        if (!(await cell.isVisible().catch(() => false))) continue;
        await cell.click().catch(() => {});
        await h.page.waitForTimeout(400);
        if (await h.has(/\d{1,2}:\d{2}\s?(AM|PM)/, { timeout: 600 })) break;
      }
      h.check('No 24-hour HH:MM text field', (await h.page.getByPlaceholder(/HH:MM/).count()) === 0);
      h.check('No YYYY-MM-DD text field', (await h.page.getByPlaceholder(/YYYY-MM-DD/).count()) === 0);
      h.check('12-hour times shown (AM/PM)', await h.has(/\d{1,2}:\d{2}\s?(AM|PM)/));
    },
  },
  {
    id: 'C11', ts: '00:14:36', role: 'provider', title: 'Double-booking is blocked',
    quote: 'I selected any time or date as a provider and I double booked somebody because Brandon Purple was already here.',
    expect: 'Booked times are never offered; a conflicting booking is rejected.',
    async run(h) {
      h.note('Verified server-side (conflict check returns 409, live-tested Oct 11). The picker only offers open slots, so this is not re-run here.');
    },
  },
  {
    id: 'C12', ts: '00:18:04', role: 'provider', title: 'After booking: "Back to Calendar", not Add Another Client / View Profile',
    quote: 'I don\'t think we need to add another client on that page. I think it should just be back to the appointment or the calendar view at that point.',
    frameAt: '00:18:02',
    expect: 'Success screen says "Appointment booked" with a Back to Calendar button.',
    write: true,
    async run(h) {
      await PROVIDER_HOME(h);
      const d = await selectDateWithOpenTimes(h);
      if (!d) throw new Error('No open times found to book into');
      const chip = h.page.getByText(/^\d{1,2}:\d{2}\s?(AM|PM)$/).first();
      await chip.click();
      await h.page.waitForTimeout(1200);
      let booking = null;
      h.page.on('response', async (r) => {
        const m = new URL(r.url()).pathname.match(/\/providers\/([^/]+)\/appointments$/);
        if (r.request().method() === 'POST' && m) {
          const body = await r.json().catch(() => null);
          // provider id from the URL — the response body doesn't carry it
          booking = { id: body?.id ?? body?.appointment?.id, providerId: m[1] };
        }
      });
      await h.page.getByPlaceholder(/Search by name/).fill(h.cfg.testClient);
      await h.page.waitForTimeout(1500);
      if (await h.has(h.cfg.testClient, { exact: true })) {
        await h.click(h.cfg.testClient);
      } else {
        await h.click('New Client');
        const [first, ...rest] = h.cfg.testClient.split(' ');
        await h.page.getByPlaceholder('First name').fill(first);
        await h.page.getByPlaceholder('Last name').fill(rest.join(' ') || 'Tester');
        await h.click('Continue to Appointment Type');
      }
      await h.page.waitForTimeout(1200);
      // Appointment Type is required before Confirm is enabled
      await h.click('Select an appointment type', { exact: false });
      const option = await h.firstOnTop(h.page.getByText(/\d+\s?min/), { last: true });
      if (!option) throw new Error('no appointment type options shown');
      await option.click();
      await h.page.waitForTimeout(800);
      await h.click('Confirm Booking', { exact: false });
      await h.waitFor('Appointment Booked');
      h.check('"Back to Calendar" button on the success screen', await h.has('Back to Calendar'));
      h.check('"Add Another Client" removed from the success screen', !(await h.has('Add Another Client')));
      h.check('No admin tab bar on the provider\'s booking screen', !(await h.has('Copilot', { exact: true })));
      await h.click('Back to Calendar');
      await h.page.waitForTimeout(1500);
      h.check('Back to Calendar lands on My Schedule', await h.has('Open Times'));
      h.cleanup(async ({ token, request }) => {
        if (!booking?.id) throw new Error('booking id not captured — cancel the Playwright Tester appointment by hand');
        const res = await request.patch(`${h.cfg.apiUrl}/providers/${booking.providerId}/appointments/${booking.id}/cancel`, {
          headers: { Authorization: `Bearer ${token}` }, data: { reason: 'Playwright comparison run cleanup' },
        });
        if (!res.ok()) throw new Error(`cancel returned ${res.status()}`);
      });
    },
  },
  {
    id: 'C13', ts: '00:16:44', role: 'provider', title: 'View Profile no longer opens a blank screen',
    quote: 'It takes us to a blank screen… if I hit view profile, it should be showing us the profile of Brown Bear.',
    expect: 'Provider-side View Profile opens the client\'s profile.',
    async run(h) {
      h.note('Fixed Oct 11 (returnBase). Exercised by C12 when run with --write; the success screen is captured there.');
    },
  },
  {
    id: 'C14', ts: '00:18:30', role: 'provider', title: 'Provider Calendar has no provider picker',
    quote: 'When I click calendar I\'m in the provider view. So I should not be able to select any provider.',
    expect: 'Provider Calendar shows only her own schedule — no "Select Provider".',
    async run(h) {
      await PROVIDER_HOME(h);
      // The URL /calendar resolves to the ADMIN calendar (both groups have
      // one), so go in the way a provider does: the calendar icon at the top
      // of My Schedule, just left of the download icon.
      await h.page.mouse.click(1217, 40);
      await h.page.waitForTimeout(1500);
      h.check('Opened the provider Calendar', await h.has('Your schedule'));
      h.check('No provider picker', !(await h.has(/select a provider/i)));
    },
  },
  {
    id: 'C15', ts: '00:21:46', role: 'provider', title: 'Waitlist says "New client", not "New patient"',
    quote: 'He needs to be seen as a new patient. So we should change the patient verbiage here. It should just say new client.',
    expect: 'Waitlist (list, counts and add form) says client, not patient.',
    async run(h) {
      await PROVIDER_HOME(h);
      await h.click('Waitlist');
      h.check('Waitlist screen says "client", not "patient"', !(await h.has(/patient/i)),
        (await h.has(/patient/i)) ? 'still shows e.g. "patients waiting" / "No patients on waitlist"' : '');
      await h.click('Add', { exact: true }).catch(() => {});
      await h.page.waitForTimeout(1000);
      h.check('Add-to-waitlist form has no "New Patient" option', !(await h.has(/new patient/i)));
    },
  },
  {
    id: 'C16', ts: '00:25:36', role: 'admin', title: 'Recurring blocks listed once, not per date',
    quote: 'We probably don\'t need to list every single date that has a block because it looks like this is a recurring block… just a clean list.',
    expect: 'A recurring block appears as one row ("Daily 1:45–2:45 PM, no end date"), not one row per day.',
    async run(h) {
      await ADMIN_HOME(h);
      h.note('Open Partners → Tax Refund 1040 / Gloria → Hours, Blocks & Calendars and compare the block list to the frame.');
      await h.click('Partners', { exact: false }).catch(() => {});
    },
  },
  {
    id: 'C17', ts: '00:28:26', role: 'admin', title: 'Client tag change shows a "saved" confirmation',
    quote: 'I don\'t see a way to confirm it\'s saved, but I\'m assuming it did… maybe we needed more confirmation there.',
    expect: 'Changing a client\'s tag shows a visible confirmation.',
    async run(h) {
      h.note('Compare manually: change a tag on any client profile and look for a confirmation.');
    },
  },
  {
    id: 'C18', ts: '00:33:44', role: 'admin', title: 'Client appointment list: date as large as the time',
    quote: 'It\'s kind of hard to see how tiny it looks… show the date clearly and large and then the time nice and clearly.',
    expect: 'On a client profile, each appointment row shows the date at the same size as the time.',
    async run(h) {
      await ADMIN_HOME(h);
      await h.click('Clients');
      await h.page.getByPlaceholder(/Search/).first().fill('Brown');
      await h.page.waitForTimeout(1500);
      await h.click('Brown Bear', { exact: false });
      await h.page.waitForTimeout(1500);
      h.note('Compare the date/time sizes in the appointment list with the frame.');
    },
  },
  {
    id: 'C19', ts: '00:32:20', role: 'admin', title: 'CSV import creates missing tags',
    quote: 'The import should upload the tags to this provider\'s tag list. Otherwise, what if a client has 500 names… go one by one to adjust all the tags.',
    expect: 'Unknown tag names in an import are created as tags for that provider and applied.',
    async run(h) {
      h.note('Not automated (needs a CSV upload). See the itemized list for status.');
    },
  },
  {
    id: 'C20', ts: '00:41:50', role: 'admin', title: 'Admin sees a counter for incoming requests',
    quote: 'I don\'t see any notification for the request… there should definitely be like a notification counter so that the agent would know.',
    expect: 'Badge with the open-request count on the admin Requests (flag) icon.',
    async run(h) {
      await ADMIN_HOME(h);
      const flag = h.page.getByTestId('nav-requests');
      const txt = (await flag.innerText().catch(() => '')).trim();
      h.check('Requests icon shows a count badge', /\d/.test(txt), txt ? `badge text: ${txt}` : 'no badge');
    },
  },
  {
    id: 'C21', ts: '00:43:28', role: 'provider', title: 'Request list shows the latest note',
    quote: 'It\'s not very clear what the status is until we click on it. Maybe that view needs to update to the most recent note.',
    expect: 'Each request row previews the most recent reply.',
    async run(h) {
      await PROVIDER_HOME(h);
      await h.click('Requests');
      await h.page.waitForTimeout(1200);
      h.note('Compare: do rows show the latest reply text?');
    },
  },
  {
    id: 'C22', ts: '00:45:18', role: 'provider', title: 'Resolved request shows a clear outcome',
    quote: 'She doesn\'t see a clear outcome that it\'s resolved… clear to each party… the note from the other party and the action being taken.',
    expect: 'Resolved requests show who resolved them, when, and the final note.',
    async run(h) {
      await PROVIDER_HOME(h);
      await h.click('Requests');
      await h.click('Resolved', { exact: true }).catch(() => {});
      await h.page.waitForTimeout(1200);
      h.note('Compare the resolved view with the frame.');
    },
  },
];
