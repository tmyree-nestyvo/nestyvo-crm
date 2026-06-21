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

config({ path: '.env.development' });

const ds = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT),
  database: process.env.DATABASE_NAME,
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  entities: [__dirname + '/entities/*.entity.ts'],
  synchronize: true,
});

async function seed() {
  await ds.initialize();
  console.log('🌱 Seeding demo data…');

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

  // Today's appointments (for a realistic dashboard)
  const today = new Date();
  const appt = (h: number, m: number) => { const d = new Date(today); d.setHours(h, m, 0, 0); return d; };
  const apptEnd = (h: number, m: number) => { const d = new Date(today); d.setHours(h, m+50, 0, 0); return d; };

  const appointments = await ds.getRepository(Appointment).save([
    ds.getRepository(Appointment).create({ providerId: p1.id, patientId: patients[0].id, appointmentTypeId: types[1].id, startAt: appt(9,0), endAt: apptEnd(9,0), status: AppointmentStatus.COMPLETED, locationType: LocationType.IN_PERSON, createdBy: agentUser.id }),
    ds.getRepository(Appointment).create({ providerId: p1.id, patientId: patients[1].id, appointmentTypeId: types[1].id, startAt: appt(10,0), endAt: apptEnd(10,0), status: AppointmentStatus.COMPLETED, locationType: LocationType.VIRTUAL, createdBy: agentUser.id }),
    ds.getRepository(Appointment).create({ providerId: p1.id, patientId: patients[2].id, appointmentTypeId: types[1].id, startAt: appt(11,0), endAt: apptEnd(11,0), status: AppointmentStatus.SCHEDULED, locationType: LocationType.IN_PERSON, createdBy: agentUser.id }),
    ds.getRepository(Appointment).create({ providerId: p2.id, patientId: patients[3].id, appointmentTypeId: types[3].id, startAt: appt(13,0), endAt: apptEnd(13,0), status: AppointmentStatus.SCHEDULED, locationType: LocationType.IN_PERSON, createdBy: agentUser.id }),
    ds.getRepository(Appointment).create({ providerId: p2.id, patientId: patients[0].id, appointmentTypeId: types[3].id, startAt: appt(14,0), endAt: apptEnd(14,0), status: AppointmentStatus.SCHEDULED, locationType: LocationType.VIRTUAL, createdBy: agentUser.id }),
    // A cancelled appointment that creates a fill opportunity
    ds.getRepository(Appointment).create({ providerId: p1.id, patientId: patients[4].id, appointmentTypeId: types[1].id, startAt: appt(15,0), endAt: apptEnd(15,0), status: AppointmentStatus.CANCELLED, locationType: LocationType.IN_PERSON, cancelledAt: new Date(), cancellationReason: 'Patient called to cancel', createdBy: agentUser.id }),
  ]);

  // Fill opportunity from the cancellation
  await ds.getRepository(FillOpportunity).save(
    ds.getRepository(FillOpportunity).create({ sourceAppointmentId: appointments[5].id, providerId: p1.id, slotStartAt: appt(15,0), slotEndAt: apptEnd(15,0), appointmentTypeId: types[1].id, status: FillOpportunityStatus.OPEN })
  );

  // Open callbacks
  await ds.getRepository(CallbackRequest).save([
    ds.getRepository(CallbackRequest).create({ patientId: patients[4].id, source: CallbackSource.MISSED_CALL, status: CallbackStatus.OPEN, assignedAgentId: agentUser.id, notes: 'Patient called back about rescheduling' }),
    ds.getRepository(CallbackRequest).create({ patientId: patients[2].id, source: CallbackSource.WEBSITE, status: CallbackStatus.OPEN, assignedAgentId: agentUser.id, notes: 'New patient inquiry via website form' }),
    ds.getRepository(CallbackRequest).create({ patientId: patients[1].id, source: CallbackSource.VOICEMAIL, status: CallbackStatus.OVERDUE, assignedAgentId: agentUser.id, notes: 'Left voicemail yesterday, needs follow-up' }),
  ]);

  // Waitlist entries
  await ds.getRepository(WaitlistEntry).save([
    ds.getRepository(WaitlistEntry).create({ providerId: p1.id, patientId: patients[4].id, waitlistType: WaitlistType.NEW_PATIENT, appointmentTypeId: types[0].id, preferredDays: [1, 3, 5], preferredTimes: { morning: true, afternoon: false, evening: false }, dateAdded: new Date(), priorityScore: 10 }),
    ds.getRepository(WaitlistEntry).create({ providerId: p2.id, patientId: patients[3].id, waitlistType: WaitlistType.FOLLOWUP, appointmentTypeId: types[3].id, preferredDays: [2, 4], preferredTimes: { morning: false, afternoon: true, evening: false }, dateAdded: new Date(Date.now() - 7 * 86400000), priorityScore: 5 }),
  ]);

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
