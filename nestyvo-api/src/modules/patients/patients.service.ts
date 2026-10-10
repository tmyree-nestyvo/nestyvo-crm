import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, In, Raw } from 'typeorm';
import { Patient, PreferredContact } from '../../database/entities/patient.entity';
import { Appointment, AppointmentStatus } from '../../database/entities/appointment.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { Provider } from '../../database/entities/provider.entity';
import { ClientTag } from '../../database/entities/client-tag.entity';

@Injectable()
export class PatientsService {
  constructor(
    @InjectRepository(Patient) private patientRepo: Repository<Patient>,
    @InjectRepository(Appointment) private appointmentRepo: Repository<Appointment>,
    @InjectRepository(AuditLog) private auditRepo: Repository<AuditLog>,
    @InjectRepository(Provider) private providerRepo: Repository<Provider>,
    @InjectRepository(ClientTag) private tagRepo: Repository<ClientTag>,
  ) {}

  async search(query: string, user: User): Promise<any[]> {
    // Admins and scheduling agents work across every partner practice — agents are
    // Charlene's offshore team, not tied to one office, so they search everyone.
    // Practice managers and providers stay scoped to their own practice.
    //
    // Charlene, Oct 6 2026 (Tax Refund 1040 pilot) — the PROVIDER branch
    // here was falling through to `{ practiceId: user.practiceId }`, but a
    // provider's own User row always has practiceId null (it lives on
    // their Provider row instead — the same gap documented since Aug 26
    // 2026 in providers.service.ts). A provider calling this endpoint got
    // either a TypeORM null-where crash or a silently empty result —
    // meaning Gloria (or any provider) could never find an existing
    // client by search at all. getRoster already has the correct pattern
    // for this exact role; reused here.
    const isCrossPractice = user.role === UserRole.ADMINISTRATOR || user.role === UserRole.SCHEDULING_AGENT;
    let scopePracticeId: string | null = user.practiceId;
    if (user.role === UserRole.PROVIDER) {
      const provider = await this.providerRepo.findOne({ where: { userId: user.id } });
      if (!provider) return [];
      scopePracticeId = provider.practiceId;
    }
    const baseWhere = isCrossPractice ? {} : { practiceId: scopePracticeId };

    const where: any[] = [
      { ...baseWhere, firstName: ILike(`%${query}%`) },
      { ...baseWhere, lastName: ILike(`%${query}%`) },
      { ...baseWhere, phone: ILike(`%${query}%`) },
      { ...baseWhere, email: ILike(`%${query}%`) },
    ];

    // Phone numbers are stored formatted ("(202) 555-0100"); a digits-only search
    // like "2025550100" wouldn't substring-match that. Compare on digits only too.
    const digits = query.replace(/\D/g, '');
    if (digits.length >= 3) {
      where.push({
        ...baseWhere,
        phone: Raw((alias) => `regexp_replace(${alias}, '[^0-9]', '', 'g') ILIKE :digits`, {
          digits: `%${digits}%`,
        }),
      });
    }

    const patients = await this.patientRepo.find({
      where,
      relations: { assignedProvider: true, practice: true },
      take: 20,
      order: { lastName: 'ASC' },
    });

    return patients.map((p) => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      phone: p.phone,
      email: p.email,
      practiceName: p.practice.name,
      waitlistStatus: p.waitlistStatus,
      assignedProvider: p.assignedProvider
        ? `${p.assignedProvider.firstName} ${p.assignedProvider.lastName}`
        : null,
    }));
  }

  async findById(id: string): Promise<any> {
    const patient = await this.patientRepo.findOne({
      where: { id },
      relations: { assignedProvider: true, tag: true, practice: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const recentAppointments = await this.appointmentRepo.find({
      where: { patientId: id },
      relations: { provider: true, appointmentType: true },
      order: { startAt: 'DESC' },
      take: 10,
    });

    return {
      id: patient.id,
      name: `${patient.firstName} ${patient.lastName}`,
      dob: patient.dob,
      phone: patient.phone,
      email: patient.email,
      preferredContact: patient.preferredContact,
      referralSource: patient.referralSource,
      waitlistStatus: patient.waitlistStatus,
      practiceId: patient.practiceId,
      practiceName: patient.practice.name,
      assignedProviderId: patient.assignedProviderId ?? null,
      assignedProvider: patient.assignedProvider
        ? `${patient.assignedProvider.firstName} ${patient.assignedProvider.lastName}`
        : null,
      tag: patient.tag ? { id: patient.tag.id, name: patient.tag.name, blockMinutes: patient.tag.blockMinutes } : null,
      recentAppointments: recentAppointments.map((a) => ({
        id: a.id,
        startAt: a.startAt,
        // Phase 0 audit (Oct 2 2026) caught this live: AppointmentCard (the
        // shared component this list is actually rendered with) reads
        // `.patient` for its bold headline — this used to come back as
        // `provider` instead, so every row on a client's Recent
        // Appointments list rendered with a blank headline. `patient` here
        // is the provider's name, which is the correct "who" to headline
        // from a client-profile vantage point.
        patient: `${a.provider.firstName} ${a.provider.lastName}`,
        // Workstream A (Oct 3 2026) — Charlene: the provider shown here
        // should be determined by the appointment itself, not the client's
        // assignedProviderId (their home provider can differ from who
        // actually saw them on a given visit). providerId lets the client
        // profile link each row into that specific appointment's context.
        providerId: a.providerId,
        type: a.appointmentType?.name,
        status: a.status,
        locationType: a.locationType,
      })),
    };
  }

  async getRoster(user: User): Promise<{ active: any[]; inactive: any[] }> {
    let patients: Patient[];

    if (user.role === UserRole.PROVIDER) {
      const provider = await this.providerRepo.findOne({ where: { userId: user.id } });
      if (!provider) return { active: [], inactive: [] };
      patients = await this.patientRepo.find({
        where: { assignedProviderId: provider.id },
        order: { lastName: 'ASC', firstName: 'ASC' },
      });
    } else if (user.role === UserRole.ADMINISTRATOR) {
      // ROSTER_ACCESS = [ADMINISTRATOR, PRACTICE_MANAGER, PROVIDER] — no
      // SCHEDULING_AGENT (agents browse via search(), which already handles
      // cross-practice correctly — see that method's comment). But admin's
      // own practiceId is just whichever practice they were seeded under
      // (Westside here), same root cause as every other scoping gap found
      // Oct 2 2026 — admin was being silently confined to one practice's
      // roster instead of seeing every practice, same "admin sees
      // everything" principle already established elsewhere (Aug 23 fix).
      patients = await this.patientRepo.find({ order: { lastName: 'ASC', firstName: 'ASC' } });
    } else {
      patients = await this.patientRepo.find({
        where: { practiceId: user.practiceId },
        order: { lastName: 'ASC', firstName: 'ASC' },
      });
    }

    if (patients.length === 0) return { active: [], inactive: [] };

    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const patientIds = patients.map((p) => p.id);

    const allAppts = await this.appointmentRepo.find({
      where: { patientId: In(patientIds) },
      order: { startAt: 'DESC' },
    });

    const apptsByPatient = new Map<string, Appointment[]>();
    for (const a of allAppts) {
      if (!apptsByPatient.has(a.patientId)) apptsByPatient.set(a.patientId, []);
      apptsByPatient.get(a.patientId)!.push(a);
    }

    const mapped = patients.map((p) => {
      const appts = apptsByPatient.get(p.id) ?? [];
      const lastAppt = appts.find(
        (a) => new Date(a.startAt) <= now && a.status === AppointmentStatus.COMPLETED,
      );
      const nextAppt = [...appts].reverse().find(
        (a) => new Date(a.startAt) > now && a.status === AppointmentStatus.SCHEDULED,
      );

      const isActive = !!(
        (lastAppt && new Date(lastAppt.startAt) >= ninetyDaysAgo) || nextAppt
      );

      let age: number | null = null;
      if (p.dob) {
        age = Math.floor(
          (now.getTime() - new Date(p.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000),
        );
      }

      return {
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        dob: p.dob,
        age,
        phone: p.phone,
        email: p.email,
        preferredContact: p.preferredContact,
        waitlistStatus: p.waitlistStatus,
        isActive,
        lastAppt: lastAppt?.startAt ?? null,
        nextAppt: nextAppt?.startAt ?? null,
      };
    });

    return {
      active: mapped.filter((p) => p.isActive),
      inactive: mapped.filter((p) => !p.isActive),
    };
  }

  async create(
    input: {
      practiceId: string;
      firstName: string;
      lastName: string;
      phone?: string;
      email?: string;
      dob?: string;
      preferredContact?: PreferredContact;
      assignedProviderId?: string;
      referralSource?: string;
      tagId?: string;
    },
    user: User,
  ) {
    const practiceId = user.role === UserRole.PRACTICE_MANAGER ? user.practiceId : input.practiceId;
    if (!practiceId) throw new BadRequestException('practiceId is required');

    if (input.assignedProviderId) {
      const provider = await this.providerRepo.findOne({ where: { id: input.assignedProviderId } });
      if (!provider) throw new NotFoundException('Provider not found');
      if (provider.practiceId !== practiceId) {
        throw new BadRequestException('Provider belongs to a different practice');
      }
    }

    if (input.tagId) {
      const tag = await this.tagRepo.findOne({ where: { id: input.tagId } });
      if (!tag) throw new NotFoundException('Tag not found');
      if (tag.practiceId !== practiceId) {
        throw new BadRequestException('Tag belongs to a different practice');
      }
    }

    const saved = await this.patientRepo.save(
      this.patientRepo.create({
        practiceId,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        email: input.email,
        dob: input.dob,
        preferredContact: input.preferredContact,
        assignedProviderId: input.assignedProviderId,
        referralSource: input.referralSource,
        tagId: input.tagId,
        createdBy: user.id,
      }),
    );

    await this.auditRepo.save(
      this.auditRepo.create({
        userId: user.id,
        action: 'patient.create',
        resourceType: 'patient',
        resourceId: saved.id,
        newValues: saved as any,
      }),
    );

    return { id: saved.id, name: `${saved.firstName} ${saved.lastName}` };
  }

  // Charlene, Oct 6 2026 (Tax Refund 1040 pilot, item 8) — "we should not
  // have to manually recreate Gloria's existing client base one client at
  // a time." Explicitly required for the pilot, not flagged-and-skipped
  // like item 8 originally was when first investigated — the only prior
  // capability was scripts/import-*-clients.ts, a standalone one-off CLI
  // script per practice, not reachable from the app at all.
  //
  // CSV only, not real Excel (.xlsx) — no spreadsheet-parsing library is
  // installed and adding one is a bigger dependency decision than this
  // pass warrants; Admin exports/saves a CSV from Excel/Sheets first.
  // Flagged honestly rather than silently claiming full Excel support.
  //
  // Column header matching is forgiving (name/client name, phone, email,
  // tag — case/spacing insensitive) since real client directories won't
  // all use Charlene's exact example headers.
  //
  // Per her doc's explicit if/then rule: "IF an imported tag is not
  // recognized THEN it is surfaced for mapping/confirmation rather than
  // silently lost or incorrectly merged." This pass doesn't build an
  // interactive mapping UI (real new feature, flagged) — it imports the
  // client either way but leaves the tag unset and reports exactly which
  // rows/tag-strings didn't match an existing tag, so nothing is silently
  // discarded or guessed at.
  async importClients(
    input: { practiceId: string; assignedProviderId?: string; csvText: string },
    user: User,
  ): Promise<{
    imported: number;
    skipped: number;
    skippedNoName: number;
    skippedDuplicate: number;
    unmatchedTags: { row: string; tag: string }[];
  }> {
    const practiceId = user.role === UserRole.PRACTICE_MANAGER ? user.practiceId : input.practiceId;
    if (!practiceId) throw new BadRequestException('practiceId is required');

    if (input.assignedProviderId) {
      const provider = await this.providerRepo.findOne({ where: { id: input.assignedProviderId } });
      if (!provider || provider.practiceId !== practiceId) {
        throw new BadRequestException('Provider not found for this practice');
      }
    }

    const rows = parseCsv(input.csvText);
    if (rows.length === 0) {
      return { imported: 0, skipped: 0, skippedNoName: 0, skippedDuplicate: 0, unmatchedTags: [] };
    }

    const header = rows[0].map((h) => h.trim().toLowerCase());
    const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
    const nameCol = col('name', 'client name', 'full name');
    const firstCol = col('first name', 'firstname');
    const lastCol = col('last name', 'lastname');
    const phoneCol = col('phone', 'phone number');
    const emailCol = col('email', 'email address');
    const tagCol = col('tag', 'client tag', 'tags');

    // Oct 9 2026 — Charlene's click-through: a fresh test CSV with
    // verifiably-new names ("Lily Sanders") still came back "0 imported,
    // 51 skipped, already in this practice." It wasn't a dedup bug — every
    // row was silently skipped below for having no detectable name column
    // at all (her header row used names like "Delete"/custom labels the
    // matcher doesn't recognize), and the frontend hardcoded "already in
    // this practice" as the skip reason regardless of actual cause. Fast,
    // clear failure here instead of a silent 100% skip; skip reasons now
    // tracked separately below so this can't be misreported again even for
    // a partial failure.
    if (nameCol < 0 && firstCol < 0) {
      throw new BadRequestException(
        'No name column found — the header row needs a "Name" (or "First Name") column.',
      );
    }

    const existingTags = await this.tagRepo.find({ where: { practiceId, isActive: true } });
    const tagByName = new Map(existingTags.map((t) => [t.name.trim().toLowerCase(), t]));

    const existingPatients = await this.patientRepo.find({ where: { practiceId } });
    const existingPhones = new Set(existingPatients.map((p) => p.phone).filter(Boolean));
    const existingEmails = new Set(existingPatients.map((p) => p.email?.toLowerCase()).filter(Boolean));

    let imported = 0;
    let skippedNoName = 0;
    let skippedDuplicate = 0;
    const unmatchedTags: { row: string; tag: string }[] = [];

    for (const cells of rows.slice(1)) {
      if (cells.every((c) => !c.trim())) continue; // blank row

      let firstName = '';
      let lastName = '';
      if (nameCol >= 0 && cells[nameCol]) {
        const parts = cells[nameCol].trim().split(/\s+/);
        firstName = parts[0] ?? '';
        lastName = parts.slice(1).join(' ') || parts[0];
      } else {
        firstName = (firstCol >= 0 ? cells[firstCol] : '')?.trim() ?? '';
        lastName = (lastCol >= 0 ? cells[lastCol] : '')?.trim() ?? '';
      }
      if (!firstName) { skippedNoName++; continue; }

      const phone = phoneCol >= 0 ? cells[phoneCol]?.trim() : undefined;
      const email = emailCol >= 0 ? cells[emailCol]?.trim() : undefined;

      // Idempotent re-import safety, same convention as the old CLI
      // scripts — a row whose phone or email already exists in this
      // practice is treated as already-imported, not duplicated.
      if ((phone && existingPhones.has(phone)) || (email && existingEmails.has(email.toLowerCase()))) {
        skippedDuplicate++;
        continue;
      }

      let tagId: string | undefined;
      const tagRaw = tagCol >= 0 ? cells[tagCol]?.trim() : undefined;
      if (tagRaw) {
        const match = tagByName.get(tagRaw.toLowerCase());
        if (match) tagId = match.id;
        else unmatchedTags.push({ row: `${firstName} ${lastName}`.trim(), tag: tagRaw });
      }

      const saved = await this.patientRepo.save(
        this.patientRepo.create({
          practiceId,
          firstName,
          lastName: lastName || firstName,
          phone: phone || undefined,
          email: email || undefined,
          preferredContact: phone ? PreferredContact.PHONE : PreferredContact.EMAIL,
          assignedProviderId: input.assignedProviderId,
          tagId,
          createdBy: user.id,
        }),
      );
      if (phone) existingPhones.add(phone);
      if (email) existingEmails.add(email.toLowerCase());
      imported++;

      await this.auditRepo.save(
        this.auditRepo.create({
          userId: user.id,
          action: 'patient.import',
          resourceType: 'patient',
          resourceId: saved.id,
          newValues: saved as any,
        }),
      );
    }

    return {
      imported,
      skipped: skippedNoName + skippedDuplicate,
      skippedNoName,
      skippedDuplicate,
      unmatchedTags,
    };
  }

  async setTag(patientId: string, tagId: string | null, user: User) {
    const patient = await this.patientRepo.findOne({ where: { id: patientId } });
    if (!patient) throw new NotFoundException('Patient not found');

    if (tagId) {
      const tag = await this.tagRepo.findOne({ where: { id: tagId } });
      if (!tag) throw new NotFoundException('Tag not found');
      if (tag.practiceId !== patient.practiceId) {
        throw new BadRequestException('Tag belongs to a different practice');
      }
    }

    const oldTagId = patient.tagId;
    patient.tagId = tagId;
    await this.patientRepo.save(patient);

    await this.auditRepo.save(
      this.auditRepo.create({
        userId: user.id,
        action: 'patient.tag_update',
        resourceType: 'patient',
        resourceId: patientId,
        oldValues: { tagId: oldTagId },
        newValues: { tagId },
      }),
    );

    return { success: true, tagId };
  }

  async getContactAttempts(patientId: string): Promise<any[]> {
    const logs = await this.auditRepo.find({
      where: { resourceType: 'patient', resourceId: patientId },
      relations: { user: true },
      order: { createdAt: 'DESC' },
      take: 30,
    });

    return logs
      .filter((l) => l.action.startsWith('scheduling_attempt.'))
      .map((l) => ({
        id: l.id,
        outcome: l.action.replace('scheduling_attempt.', ''),
        attemptType: l.newValues?.attemptType,
        notes: l.newValues?.notes,
        agentName: l.user ? `${l.user.firstName} ${l.user.lastName}` : null,
        createdAt: l.createdAt,
      }));
  }
}

// Minimal CSV parser (not a full RFC4180 implementation) — handles quoted
// fields containing commas ("Smith, Jr.") and escaped quotes (""), which a
// real client directory exported from Excel/Sheets is likely to contain.
// No library dependency added for this — see importClients' own comment.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') pushField();
    else if (c === '\n') pushRow();
    else if (c === '\r') { /* skip, \n handles the row break */ }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows.filter((r) => r.length > 0);
}
