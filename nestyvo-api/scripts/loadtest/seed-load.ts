import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Practice } from '../../src/database/entities/practice.entity';
import { User, UserRole } from '../../src/database/entities/user.entity';
import { Provider, ProviderStatus } from '../../src/database/entities/provider.entity';
import { ProviderAppointmentType, AppointmentCategory } from '../../src/database/entities/provider-appointment-type.entity';
import { ProviderAvailability } from '../../src/database/entities/provider-availability.entity';
import { Patient, PreferredContact } from '../../src/database/entities/patient.entity';
import { WaitlistEntry, WaitlistType } from '../../src/database/entities/waitlist-entry.entity';
import { AgentProviderAssignment } from '../../src/database/entities/agent-provider-assignment.entity';
import { Appointment, AppointmentStatus, LocationType } from '../../src/database/entities/appointment.entity';
import { Ticket, TicketCategory, TicketPriority, TicketStatus } from '../../src/database/entities/ticket.entity';
import { hashPassword } from '../../src/auth/password.util';

// Load-test data (Oct 19 2026 — Troy: "if we were supporting 20 clients with
// 4 or 5 agents does the current infra support?"). 20 practices, ~50
// providers, 2,000 clients, a year of appointments, 5 agents covering every
// provider. Refuses to run unless the database is named nestyvo_load, so it
// can never touch production or the dev database. Usage:
//   DATABASE_URL=postgres://...:5440/nestyvo_load LOADTEST_PASSWORD=... npx ts-node scripts/loadtest/seed-load.ts

const url = process.env.DATABASE_URL ?? '';
if (!/\/nestyvo_load(\?|$)/.test(url)) {
  console.error('Refusing to seed: DATABASE_URL must point at a database named nestyvo_load.');
  process.exit(1);
}
const PASSWORD = process.env.LOADTEST_PASSWORD;
if (!PASSWORD) { console.error('Set LOADTEST_PASSWORD (used for every test login).'); process.exit(1); }

const PRACTICES = 20, AGENTS = 5, PATIENTS_PER_PRACTICE = 100;
const PAST_DAYS = 90, FUTURE_DAYS = 365, BOOKED_PER_DAY = 4;
const ds = new DataSource({ type: 'postgres', url, entities: [__dirname + '/../../src/database/entities/*.entity.ts'], synchronize: true });

let seedN = 42;
const rand = () => ((seedN = (seedN * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T>(a: T[]) => a[Math.floor(rand() * a.length)];
const FIRST = ['Maria', 'David', 'Aisha', 'Carlos', 'Jennifer', 'Kevin', 'Priya', 'Marcus', 'Elena', 'Sam', 'Grace', 'Omar', 'Lena', 'Tyler', 'Nina'];
const LAST = ['Gonzalez', 'Kim', 'Johnson', 'Rivera', 'Walsh', 'Nguyen', 'Patel', 'Brooks', 'Lopez', 'Reed', 'Chen', 'Hassan', 'Park', 'Diaz', 'Ward'];

async function chunks<T>(repo: any, rows: T[], size = 1000) {
  const out: any[] = [];
  for (let i = 0; i < rows.length; i += size) out.push(...(await repo.save(rows.slice(i, i + size).map((r) => repo.create(r)))));
  return out;
}

async function main() {
  await ds.initialize();
  const hash = await hashPassword(PASSWORD!);
  const R = <T>(e: new () => T) => ds.getRepository(e as any);

  const admin = await R(User).save(R(User).create({ cognitoId: 'load-admin', email: 'load-admin@loadtest.local', firstName: 'Load', lastName: 'Admin', role: UserRole.ADMINISTRATOR, isActive: true, passwordHash: hash, mustChangePassword: false } as any)) as any;
  const agents = await chunks(R(User), Array.from({ length: AGENTS }, (_, i) => ({ cognitoId: `load-agent-${i + 1}`, email: `load-agent-${i + 1}@loadtest.local`, firstName: 'Agent', lastName: String(i + 1), role: UserRole.SCHEDULING_AGENT, isActive: true, passwordHash: hash, mustChangePassword: false })));

  const practices = await chunks(R(Practice), Array.from({ length: PRACTICES }, (_, i) => ({ name: `Load Practice ${i + 1}`, phone: '(555) 555-0100', email: `practice${i + 1}@loadtest.local`, timezone: 'America/Los_Angeles' })));

  // 2 or 3 providers per practice (~50 total), each with their own login.
  const providerRows: any[] = [];
  practices.forEach((p, i) => { for (let k = 0; k < (i % 2 === 0 ? 3 : 2); k++) providerRows.push({ practiceId: p.id, firstName: pick(FIRST), lastName: `${pick(LAST)}-${i + 1}${String.fromCharCode(65 + k)}`, credentials: 'LCSW', status: ProviderStatus.ACTIVE, isVirtual: true, isInPerson: true, defaultSlotDurationMin: 60 }); });
  const providers = await chunks(R(Provider), providerRows);
  const providerUsers = await chunks(R(User), providers.map((p, i) => ({ cognitoId: `load-provider-${i + 1}`, email: `load-provider-${i + 1}@loadtest.local`, firstName: p.firstName, lastName: p.lastName, role: UserRole.PROVIDER, practiceId: p.practiceId, isActive: true, passwordHash: hash, mustChangePassword: false })));
  // Link each provider to its login.
  for (let i = 0; i < providers.length; i++) await R(Provider).update(providers[i].id, { userId: providerUsers[i].id } as any);

  const types = await chunks(R(ProviderAppointmentType), providers.flatMap((p) => [
    { providerId: p.id, name: 'Intake', durationMin: 60, category: AppointmentCategory.NEW_PATIENT },
    { providerId: p.id, name: 'Follow-Up', durationMin: 60, category: AppointmentCategory.FOLLOWUP },
  ]));
  await chunks(R(ProviderAvailability), providers.flatMap((p) => [1, 2, 3, 4, 5].map((dow) => ({ providerId: p.id, dayOfWeek: dow, startTime: '09:00', endTime: '17:00', isActive: true }))));
  await chunks(R(AgentProviderAssignment), agents.flatMap((a) => providers.map((p) => ({ agentUserId: a.id, providerId: p.id, isActive: true }))));

  const patients = await chunks(R(Patient), practices.flatMap((pr) => {
    const provs = providers.filter((p) => p.practiceId === pr.id);
    return Array.from({ length: PATIENTS_PER_PRACTICE }, (_, i) => ({ practiceId: pr.id, firstName: pick(FIRST), lastName: pick(LAST), phone: `(555) ${String(100 + (i % 900)).padStart(3, '0')}-${String(1000 + i).slice(-4)}`, email: `client${i}-${pr.id.slice(0, 6)}@loadtest.local`, preferredContact: PreferredContact.PHONE, assignedProviderId: provs[i % provs.length].id }));
  }));

  // A year ahead and 90 days back: about 4 booked hours per provider per weekday.
  const appts: any[] = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (const p of providers) {
    const myPatients = patients.filter((x) => x.assignedProviderId === p.id);
    const fu = types.find((t) => t.providerId === p.id && t.name === 'Follow-Up');
    for (let d = -PAST_DAYS; d <= FUTURE_DAYS; d++) {
      const day = new Date(today); day.setDate(day.getDate() + d);
      if (day.getDay() === 0 || day.getDay() === 6) continue;
      const hours = [9, 10, 11, 12, 13, 14, 15, 16].sort(() => rand() - 0.5).slice(0, BOOKED_PER_DAY);
      for (const h of hours) {
        const s = new Date(day); s.setHours(h, 0, 0, 0);
        appts.push({ providerId: p.id, patientId: pick(myPatients).id, appointmentTypeId: fu.id, startAt: s, endAt: new Date(s.getTime() + 3_600_000), status: d < 0 ? AppointmentStatus.COMPLETED : AppointmentStatus.SCHEDULED, locationType: LocationType.VIRTUAL, createdBy: admin.id });
      }
    }
  }
  await chunks(R(Appointment), appts, 2000);

  await chunks(R(WaitlistEntry), providers.flatMap((p) => Array.from({ length: 5 }, () => ({ providerId: p.id, patientId: pick(patients.filter((x) => x.assignedProviderId === p.id)).id, waitlistType: WaitlistType.FOLLOWUP, preferredDays: [1, 3, 5], preferredTimes: { morning: true, afternoon: true, evening: false }, dateAdded: new Date(), priorityScore: 5 }))));
  let n = 1;
  await chunks(R(Ticket), practices.flatMap((pr) => Array.from({ length: 3 }, () => ({ ticketNumber: n++, practiceId: pr.id, category: TicketCategory.SCHEDULING, priority: TicketPriority.NORMAL, subject: 'Load test request', description: 'Seeded for load testing.', status: TicketStatus.OPEN, createdByUserId: agents[0].id }))));

  console.log(`Seeded: ${practices.length} practices, ${providers.length} providers, ${patients.length} clients, ${appts.length} appointments, ${agents.length} agents + 1 admin.`);
  await ds.destroy();
}
main().catch((e) => { console.error(e); process.exit(1); });
