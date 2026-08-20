import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { Practice } from './entities/practice.entity';
import { User, UserRole } from './entities/user.entity';
import { Provider, ProviderStatus } from './entities/provider.entity';
import { ProviderAppointmentType, AppointmentCategory } from './entities/provider-appointment-type.entity';
import { ProviderAvailability } from './entities/provider-availability.entity';
import { Patient, PreferredContact } from './entities/patient.entity';
import { WaitlistEntry, WaitlistType } from './entities/waitlist-entry.entity';
import { AgentProviderAssignment } from './entities/agent-provider-assignment.entity';
import { Appointment, AppointmentStatus, LocationType } from './entities/appointment.entity';
import { FillOpportunity, FillOpportunityStatus } from './entities/fill-opportunity.entity';
import { CallbackRequest, CallbackSource, CallbackStatus } from './entities/callback-request.entity';
import { AuditLog } from './entities/audit-log.entity';
import { ClientTag } from './entities/client-tag.entity';
import { Ticket, TicketCategory, TicketPriority, TicketStatus } from './entities/ticket.entity';

if (!process.env.DATABASE_URL) {
  config({ path: '.env.development' });
}

const databaseUrl = process.env.DATABASE_URL;
const ds = new DataSource(
  databaseUrl
    ? {
        type: 'postgres',
        url: databaseUrl,
        ssl: { rejectUnauthorized: false },
        entities: [__dirname + '/entities/*.entity.ts'],
        synchronize: true,
      }
    : {
        type: 'postgres',
        host: process.env.DATABASE_HOST,
        port: Number(process.env.DATABASE_PORT),
        database: process.env.DATABASE_NAME,
        username: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        entities: [__dirname + '/entities/*.entity.ts'],
        synchronize: true,
      },
);

async function seed() {
  await ds.initialize();
  console.log('🌱 Seeding demo data…');

  // Wipe existing demo data so the seed is idempotent.
  await ds.query(`
    TRUNCATE TABLE
      audit_logs, callback_requests, fill_opportunities, outreach_queue,
      waitlist_entries, appointments, agent_provider_assignments, users,
      provider_availability, provider_appointment_types, provider_blocks,
      providers, patients, practices
      CASCADE
  `);
  console.log('   Cleared existing data.');

  // Practice
  const practice = ds.getRepository(Practice).create({
    name: 'Westside Mental Health Group',
    address: '1200 Wilshire Blvd, Los Angeles, CA 90017',
    phone: '(310) 555-0100',
    email: 'admin@westsidemental.com',
    timezone: 'America/Los_Angeles',
  });
  await ds.getRepository(Practice).save(practice);

  // Providers
  const p1 = ds.getRepository(Provider).create({
    practiceId: practice.id,
    firstName: 'Sarah',
    lastName: 'Torres',
    credentials: 'LCSW',
    specialty: 'Anxiety & Depression',
    phone: '(310) 555-0101',
    email: 'storres@westsidemental.com',
    isVirtual: true,
    isInPerson: true,
    status: ProviderStatus.ACTIVE,
    newPatientCapacity: 5,
    followupCapacity: 20,
  });
  const p2 = ds.getRepository(Provider).create({
    practiceId: practice.id,
    firstName: 'James',
    lastName: 'Patel',
    credentials: 'PhD',
    specialty: 'Trauma & PTSD',
    phone: '(310) 555-0102',
    email: 'jpatel@westsidemental.com',
    isVirtual: false,
    isInPerson: true,
    status: ProviderStatus.ACTIVE,
    newPatientCapacity: 3,
    followupCapacity: 15,
  });
  await ds.getRepository(Provider).save([p1, p2]);

  // Appointment types
  const types = await ds.getRepository(ProviderAppointmentType).save([
    ds.getRepository(ProviderAppointmentType).create({ providerId: p1.id, name: 'Initial Evaluation', durationMin: 60, category: AppointmentCategory.NEW_PATIENT }),
    ds.getRepository(ProviderAppointmentType).create({ providerId: p1.id, name: 'Follow-Up 50min', durationMin: 50, category: AppointmentCategory.FOLLOWUP }),
    ds.getRepository(ProviderAppointmentType).create({ providerId: p2.id, name: 'Initial Intake', durationMin: 90, category: AppointmentCategory.NEW_PATIENT }),
    ds.getRepository(ProviderAppointmentType).create({ providerId: p2.id, name: 'Therapy Session', durationMin: 50, category: AppointmentCategory.FOLLOWUP }),
  ]);

  // Provider availability (Mon–Fri 9am–5pm)
  const availRows: Partial<ProviderAvailability>[] = [];
  for (const provider of [p1, p2]) {
    for (const dow of [1, 2, 3, 4, 5]) {
      availRows.push({ providerId: provider.id, dayOfWeek: dow, startTime: '09:00', endTime: '17:00', isActive: true });
    }
  }
  await ds.getRepository(ProviderAvailability).save(availRows);

  // Users
  const agentUser = ds.getRepository(User).create({
    cognitoId: 'dev-agent@nestyvo.com',
    email: 'agent@nestyvo.com',
    firstName: 'Charlene',
    lastName: 'Armendariz',
    role: UserRole.SCHEDULING_AGENT,
    practiceId: practice.id,
    isActive: true,
  });
  const adminUser = ds.getRepository(User).create({
    cognitoId: 'dev-admin@nestyvo.com',
    email: 'admin@nestyvo.com',
    firstName: 'Troy',
    lastName: 'Myree',
    role: UserRole.ADMINISTRATOR,
    practiceId: practice.id,
    isActive: true,
  });
  await ds.getRepository(User).save([agentUser, adminUser]);

  // Assign agent to both providers
  await ds.getRepository(AgentProviderAssignment).save([
    ds.getRepository(AgentProviderAssignment).create({ agentUserId: agentUser.id, providerId: p1.id, isActive: true }),
    ds.getRepository(AgentProviderAssignment).create({ agentUserId: agentUser.id, providerId: p2.id, isActive: true }),
  ]);

  // Sample patients
  const patients = await ds.getRepository(Patient).save([
    ds.getRepository(Patient).create({ practiceId: practice.id, firstName: 'Maria', lastName: 'Gonzalez', dob: '1988-04-12', phone: '(213) 555-0201', email: 'mgonzalez@email.com', preferredContact: PreferredContact.PHONE, assignedProviderId: p1.id, referralSource: 'Headway' }),
    ds.getRepository(Patient).create({ practiceId: practice.id, firstName: 'David', lastName: 'Kim', dob: '1995-09-23', phone: '(310) 555-0202', email: 'dkim@email.com', preferredContact: PreferredContact.SMS, assignedProviderId: p1.id }),
    ds.getRepository(Patient).create({ practiceId: practice.id, firstName: 'Aisha', lastName: 'Johnson', dob: '1979-01-30', phone: '(323) 555-0203', preferredContact: PreferredContact.PHONE, assignedProviderId: p2.id }),
    ds.getRepository(Patient).create({ practiceId: practice.id, firstName: 'Carlos', lastName: 'Rivera', dob: '2001-07-15', phone: '(424) 555-0204', email: 'crivera@email.com', preferredContact: PreferredContact.EMAIL, assignedProviderId: p2.id }),
    ds.getRepository(Patient).create({ practiceId: practice.id, firstName: 'Jennifer', lastName: 'Walsh', dob: '1985-11-08', phone: '(310) 555-0205', preferredContact: PreferredContact.SMS }),
  ]);

  // Client tags (block-size classification) + assign a couple for demo
  const tags = await ds.getRepository(ClientTag).save([
    ds.getRepository(ClientTag).create({ practiceId: practice.id, name: '30 Min Client', blockMinutes: 30 }),
    ds.getRepository(ClientTag).create({ practiceId: practice.id, name: '1 Hour Client', blockMinutes: 60 }),
    ds.getRepository(ClientTag).create({ practiceId: practice.id, name: '90 Min Intake', blockMinutes: 90 }),
  ]);
  patients[1].tagId = tags[1].id; // David Kim → 1 Hour Client
  patients[3].tagId = tags[0].id; // Carlos Rivera → 30 Min Client
  await ds.getRepository(Patient).save([patients[1], patients[3]]);

  // Second practice — different vertical (tax prep), demonstrates multi-partner
  // customer linking: one patient below intentionally shares Maria Gonzalez's phone.
  const taxPractice = ds.getRepository(Practice).create({
    name: 'Ortiz & Associates',
    address: '4400 Riverside Dr, Riverside, CA 92501',
    phone: '(951) 555-0300',
    email: 'office@ortiztax.com',
    timezone: 'America/Los_Angeles',
  });
  await ds.getRepository(Practice).save(taxPractice);

  const taxPreparer = ds.getRepository(Provider).create({
    practiceId: taxPractice.id,
    firstName: 'Sal',
    lastName: 'Ortiz',
    credentials: 'EA',
    specialty: 'Tax Preparation',
    phone: '(951) 555-0301',
    email: 'sal@ortiztax.com',
    isVirtual: false,
    isInPerson: true,
    status: ProviderStatus.ACTIVE,
  });
  await ds.getRepository(Provider).save(taxPreparer);

  await ds.getRepository(Patient).save([
    ds.getRepository(Patient).create({
      practiceId: taxPractice.id,
      firstName: 'Maria',
      lastName: 'Gonzalez',
      phone: '(213) 555-0201',
      email: 'mgonzalez@email.com',
      preferredContact: PreferredContact.PHONE,
      assignedProviderId: taxPreparer.id,
    }),
    ds.getRepository(Patient).create({
      practiceId: taxPractice.id,
      firstName: 'Robert',
      lastName: 'Nguyen',
      phone: '(951) 555-0210',
      email: 'rnguyen@email.com',
      preferredContact: PreferredContact.EMAIL,
      assignedProviderId: taxPreparer.id,
    }),
  ]);

  // Helper: build a datetime offset from today
  const today = new Date();
  const daysAgo = (n: number, h: number, m = 0) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const appt = (h: number, m: number) => { const d = new Date(today); d.setHours(h, m, 0, 0); return d; };
  const apptEnd = (start: Date, durMin = 50) => new Date(start.getTime() + durMin * 60_000);

  // Historical completed appointments — gives cadence algo enough signal.
  // Last visit is set so each patient is DUE or OVERDUE now (great fill candidates).
  //   Maria  → Torres, monthly  (~28d), last visit 35d ago  → 7d overdue
  //   David  → Torres, bi-weekly (~14d), last visit 18d ago → 4d overdue
  //   Aisha  → Patel,  weekly   (~7d),  last visit 9d ago   → 2d overdue
  //   Carlos → Patel,  3-weekly (~21d), last visit 23d ago  → 2d overdue
  const histAppts: Partial<Appointment>[] = [];
  for (const daysBack of [35, 63, 91, 119]) {
    const s = daysAgo(daysBack, 9);
    histAppts.push({ providerId: p1.id, patientId: patients[0].id, appointmentTypeId: types[1].id, startAt: s, endAt: apptEnd(s), status: AppointmentStatus.COMPLETED, locationType: LocationType.IN_PERSON, createdBy: agentUser.id });
  }
  for (const daysBack of [18, 32, 46, 60]) {
    const s = daysAgo(daysBack, 10);
    histAppts.push({ providerId: p1.id, patientId: patients[1].id, appointmentTypeId: types[1].id, startAt: s, endAt: apptEnd(s), status: AppointmentStatus.COMPLETED, locationType: LocationType.VIRTUAL, createdBy: agentUser.id });
  }
  for (const daysBack of [9, 16, 23, 30]) {
    const s = daysAgo(daysBack, 11);
    histAppts.push({ providerId: p2.id, patientId: patients[2].id, appointmentTypeId: types[3].id, startAt: s, endAt: apptEnd(s), status: AppointmentStatus.COMPLETED, locationType: LocationType.IN_PERSON, createdBy: agentUser.id });
  }
  for (const daysBack of [23, 44, 65, 86]) {
    const s = daysAgo(daysBack, 13);
    histAppts.push({ providerId: p2.id, patientId: patients[3].id, appointmentTypeId: types[3].id, startAt: s, endAt: apptEnd(s), status: AppointmentStatus.COMPLETED, locationType: LocationType.IN_PERSON, createdBy: agentUser.id });
  }
  await ds.getRepository(Appointment).save(histAppts.map((a) => ds.getRepository(Appointment).create(a)));

  // Today's scheduled / cancelled appointments (dashboard shows these)
  const appointments = await ds.getRepository(Appointment).save([
    ds.getRepository(Appointment).create({ providerId: p1.id, patientId: patients[2].id, appointmentTypeId: types[1].id, startAt: appt(9,0), endAt: apptEnd(appt(9,0)), status: AppointmentStatus.SCHEDULED, locationType: LocationType.IN_PERSON, createdBy: agentUser.id }),
    ds.getRepository(Appointment).create({ providerId: p1.id, patientId: patients[3].id, appointmentTypeId: types[1].id, startAt: appt(10,0), endAt: apptEnd(appt(10,0)), status: AppointmentStatus.SCHEDULED, locationType: LocationType.VIRTUAL, createdBy: agentUser.id }),
    ds.getRepository(Appointment).create({ providerId: p2.id, patientId: patients[2].id, appointmentTypeId: types[3].id, startAt: appt(11,0), endAt: apptEnd(appt(11,0)), status: AppointmentStatus.SCHEDULED, locationType: LocationType.IN_PERSON, createdBy: agentUser.id }),
    ds.getRepository(Appointment).create({ providerId: p2.id, patientId: patients[3].id, appointmentTypeId: types[3].id, startAt: appt(13,0), endAt: apptEnd(appt(13,0)), status: AppointmentStatus.SCHEDULED, locationType: LocationType.IN_PERSON, createdBy: agentUser.id }),
    ds.getRepository(Appointment).create({ providerId: p2.id, patientId: patients[0].id, appointmentTypeId: types[3].id, startAt: appt(14,0), endAt: apptEnd(appt(14,0)), status: AppointmentStatus.SCHEDULED, locationType: LocationType.VIRTUAL, createdBy: agentUser.id }),
    // Cancelled appointment → creates a fill opportunity
    ds.getRepository(Appointment).create({ providerId: p1.id, patientId: patients[4].id, appointmentTypeId: types[1].id, startAt: appt(15,0), endAt: apptEnd(appt(15,0)), status: AppointmentStatus.CANCELLED, locationType: LocationType.IN_PERSON, cancelledAt: new Date(), cancellationReason: 'Patient called to cancel', createdBy: agentUser.id }),
  ]);

  // Fill opportunities — one open (from today's cancellation), three already filled this month
  await ds.getRepository(FillOpportunity).save([
    ds.getRepository(FillOpportunity).create({ sourceAppointmentId: appointments[5].id, providerId: p1.id, slotStartAt: appt(15,0), slotEndAt: apptEnd(appt(15,0)), appointmentTypeId: types[1].id, status: FillOpportunityStatus.OPEN }),
    ds.getRepository(FillOpportunity).create({ sourceAppointmentId: appointments[5].id, providerId: p1.id, slotStartAt: daysAgo(5,10), slotEndAt: apptEnd(daysAgo(5,10)), appointmentTypeId: types[0].id, status: FillOpportunityStatus.FILLED }),
    ds.getRepository(FillOpportunity).create({ sourceAppointmentId: appointments[5].id, providerId: p1.id, slotStartAt: daysAgo(12,14), slotEndAt: apptEnd(daysAgo(12,14)), appointmentTypeId: types[1].id, status: FillOpportunityStatus.FILLED }),
    ds.getRepository(FillOpportunity).create({ sourceAppointmentId: appointments[5].id, providerId: p2.id, slotStartAt: daysAgo(8,11), slotEndAt: apptEnd(daysAgo(8,11)), appointmentTypeId: types[3].id, status: FillOpportunityStatus.FILLED }),
  ]);

  // Open callbacks
  await ds.getRepository(CallbackRequest).save([
    ds.getRepository(CallbackRequest).create({ patientId: patients[4].id, source: CallbackSource.MISSED_CALL, status: CallbackStatus.OPEN, assignedAgentId: agentUser.id, notes: 'Patient called back about rescheduling' }),
    ds.getRepository(CallbackRequest).create({ patientId: patients[2].id, source: CallbackSource.WEBSITE, status: CallbackStatus.OPEN, assignedAgentId: agentUser.id, notes: 'New patient inquiry via website form' }),
    ds.getRepository(CallbackRequest).create({ patientId: patients[1].id, source: CallbackSource.VOICEMAIL, status: CallbackStatus.OVERDUE, assignedAgentId: agentUser.id, notes: 'Left voicemail yesterday, needs follow-up' }),
  ]);

  // Example tickets — agent escalations to the office
  await ds.getRepository(Ticket).save([
    ds.getRepository(Ticket).create({
      practiceId: practice.id,
      patientId: patients[0].id,
      category: TicketCategory.BILLING,
      priority: TicketPriority.NORMAL,
      subject: 'Insurance card on file is expired',
      description: 'Maria mentioned her insurance renewed in July but we still have the old card on file. Needs updated info before her next visit.',
      status: TicketStatus.OPEN,
      createdByUserId: agentUser.id,
    }),
    ds.getRepository(Ticket).create({
      practiceId: practice.id,
      patientId: patients[4].id,
      category: TicketCategory.SCHEDULING,
      priority: TicketPriority.HIGH,
      subject: 'Wants a same-day exception outside normal hours',
      description: 'Jennifer asked about an early-morning slot before 9am — outside current provider availability. Needs office sign-off before we offer that.',
      status: TicketStatus.OPEN,
      createdByUserId: agentUser.id,
    }),
  ]);

  // Waitlist entries
  await ds.getRepository(WaitlistEntry).save([
    ds.getRepository(WaitlistEntry).create({ providerId: p1.id, patientId: patients[4].id, waitlistType: WaitlistType.NEW_PATIENT, appointmentTypeId: types[0].id, preferredDays: [1, 3, 5], preferredTimes: { morning: true, afternoon: false, evening: false }, dateAdded: new Date(), priorityScore: 10 }),
    ds.getRepository(WaitlistEntry).create({ providerId: p2.id, patientId: patients[3].id, waitlistType: WaitlistType.FOLLOWUP, appointmentTypeId: types[3].id, preferredDays: [2, 4], preferredTimes: { morning: false, afternoon: true, evening: false }, dateAdded: new Date(Date.now() - 7 * 86400000), priorityScore: 5 }),
  ]);

  // Seed contact attempt history for demo patients
  const auditRepo = ds.getRepository(AuditLog);
  await ds.query(
    `INSERT INTO audit_logs ("userId", action, "resourceType", "resourceId", "newValues", "createdAt") VALUES
      ($1,'scheduling_attempt.no_answer','patient',$2,'{"attemptType":"call","outcome":"no_answer","notes":"Rang 4 times, no pickup"}',NOW()-INTERVAL'5 days'),
      ($1,'scheduling_attempt.voicemail','patient',$2,'{"attemptType":"call","outcome":"voicemail","notes":"Left message to call back"}',NOW()-INTERVAL'3 days'),
      ($1,'scheduling_attempt.scheduled','patient',$2,'{"attemptType":"call","outcome":"scheduled","notes":"Confirmed Thu 2pm with Dr. Torres"}',NOW()-INTERVAL'1 day'),
      ($1,'scheduling_attempt.reached','patient',$3,'{"attemptType":"call","outcome":"reached","notes":"Discussed availability"}',NOW()-INTERVAL'7 days'),
      ($1,'scheduling_attempt.scheduled','patient',$3,'{"attemptType":"call","outcome":"scheduled","notes":"Booked follow-up for next week"}',NOW()-INTERVAL'6 days'),
      ($1,'scheduling_attempt.busy','patient',$4,'{"attemptType":"call","outcome":"busy"}',NOW()-INTERVAL'2 days')`,
    [agentUser.id, patients[4].id, patients[0].id, patients[1].id],
  );

  console.log('✅ Seed complete.');
  console.log('');
  console.log('Demo accounts:');
  console.log('  agent@nestyvo.com  → Scheduling Agent (Charlene)');
  console.log('  admin@nestyvo.com  → Administrator (Troy)');
  console.log('');
  console.log('Get a dev token:');
  console.log('  curl -X POST http://localhost:3000/api/v1/dev/login -H "Content-Type: application/json" -d \'{"email":"agent@nestyvo.com"}\'');

  await ds.destroy();
}

seed().catch((err) => { console.error(err); process.exit(1); });
