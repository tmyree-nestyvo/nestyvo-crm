import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Between } from 'typeorm';
import { randomBytes } from 'crypto';
import { Provider, ProviderStatus } from '../../database/entities/provider.entity';
import { Appointment, AppointmentStatus } from '../../database/entities/appointment.entity';
import { AgentProviderAssignment } from '../../database/entities/agent-provider-assignment.entity';
import { ProviderAvailability } from '../../database/entities/provider-availability.entity';
import { ProviderBlock, BlockType } from '../../database/entities/provider-block.entity';
import { ExternalBusyBlock } from '../../database/entities/external-busy-block.entity';
import { ProviderAppointmentType } from '../../database/entities/provider-appointment-type.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { UsersService } from '../users/users.service';

const MAX_RECURRING_WEEKS = 26;
const MAX_RECURRING_OCCURRENCES = 52;

export interface CreateProviderInput {
  practiceId: string;
  firstName: string;
  lastName: string;
  credentials?: string;
  specialty?: string;
  phone?: string;
  email?: string;
  officeLocation?: string;
  isVirtual?: boolean;
  isInPerson?: boolean;
  /** If set, also creates a PROVIDER-role login for this person (see UsersService.create). */
  loginEmail?: string;
  /** Optional — admin can set it directly; otherwise a temp password is generated. */
  loginPassword?: string;
  /** Session length in minutes for open-slot generation. Defaults to 50 on the entity. */
  defaultSlotDurationMin?: number;
}

@Injectable()
export class ProvidersService {
  constructor(
    @InjectRepository(Provider) private providerRepo: Repository<Provider>,
    @InjectRepository(Appointment) private appointmentRepo: Repository<Appointment>,
    @InjectRepository(AgentProviderAssignment) private assignmentRepo: Repository<AgentProviderAssignment>,
    @InjectRepository(ProviderAvailability) private availabilityRepo: Repository<ProviderAvailability>,
    @InjectRepository(ProviderBlock) private blockRepo: Repository<ProviderBlock>,
    @InjectRepository(ExternalBusyBlock) private externalBlockRepo: Repository<ExternalBusyBlock>,
    @InjectRepository(ProviderAppointmentType) private appointmentTypeRepo: Repository<ProviderAppointmentType>,
    private usersService: UsersService,
  ) {}

  // Partner onboarding (Charlene, Sep 24 2026): create a provider's business/
  // clinical profile and, optionally, their login in one call. Login is
  // created FIRST (when requested) so a duplicate-email failure never leaves
  // an orphan Provider row with no way to log in — see UsersService.create.
  async create(input: CreateProviderInput): Promise<{ provider: Provider; tempPassword: string | null }> {
    let userId: string | undefined;
    let tempPassword: string | null = null;
    if (input.loginEmail) {
      const { user, tempPassword: generated } = await this.usersService.create({
        email: input.loginEmail,
        firstName: input.firstName,
        lastName: input.lastName,
        role: UserRole.PROVIDER,
        phone: input.phone,
        initialPassword: input.loginPassword,
      });
      userId = user.id;
      tempPassword = generated;
    }

    const provider = this.providerRepo.create({
      practiceId: input.practiceId,
      userId,
      firstName: input.firstName,
      lastName: input.lastName,
      credentials: input.credentials,
      specialty: input.specialty,
      phone: input.phone,
      email: input.email,
      officeLocation: input.officeLocation,
      isVirtual: input.isVirtual ?? false,
      isInPerson: input.isInPerson ?? true,
      // Entity default (50) applies when omitted — unchanged behavior for
      // every existing onboarding flow that doesn't pass this yet.
      ...(input.defaultSlotDurationMin !== undefined ? { defaultSlotDurationMin: input.defaultSlotDurationMin } : {}),
    });
    const saved = await this.providerRepo.save(provider);
    return { provider: saved, tempPassword };
  }

  // Charlene (Sep 30 2026) onboarded Peace of Mind leaving the login email
  // blank, then found there was no way back in to add it — a provider could
  // be created but never edited, so a partner with no login was permanently
  // stuck without one. This fills that gap, including creating the login
  // after the fact (the common case: business details first, credentials
  // once the partner has actually agreed to start).
  async update(
    providerId: string,
    input: Partial<Omit<CreateProviderInput, 'practiceId'>>,
    user: User,
  ): Promise<{ provider: Provider; tempPassword: string | null }> {
    const provider = await this.assertCanManage(providerId, user);
    let tempPassword: string | null = null;

    if (input.loginEmail) {
      if (provider.userId) {
        throw new BadRequestException('This provider already has a login.');
      }
      // Login first, provider second — same ordering as create(), so a
      // duplicate-email failure leaves no half-updated provider behind.
      const { user: created, tempPassword: generated } = await this.usersService.create({
        email: input.loginEmail,
        firstName: input.firstName ?? provider.firstName,
        lastName: input.lastName ?? provider.lastName,
        role: UserRole.PROVIDER,
        phone: input.phone ?? provider.phone,
        initialPassword: input.loginPassword,
      });
      provider.userId = created.id;
      tempPassword = generated;
    }

    for (const field of [
      'firstName', 'lastName', 'credentials', 'specialty',
      'phone', 'email', 'officeLocation', 'isVirtual', 'isInPerson',
      'defaultSlotDurationMin',
    ] as const) {
      if (input[field] !== undefined) (provider as any)[field] = input[field];
    }

    const saved = await this.providerRepo.save(provider);
    return { provider: saved, tempPassword };
  }

  // See UsersController's own reset-password for the admin/agent-account
  // equivalent — this is the provider-scoped path, reachable by a
  // practice_manager for their own practice, not just an admin.
  async resetLoginPassword(providerId: string, user: User): Promise<{ tempPassword: string }> {
    const provider = await this.assertCanManage(providerId, user);
    if (!provider.userId) throw new BadRequestException('This provider has no login to reset.');
    const { tempPassword } = await this.usersService.resetPassword(provider.userId);
    return { tempPassword };
  }

  // Admins manage every partner; practice managers only their own practice.
  private async assertCanManage(providerId: string, user: User): Promise<Provider> {
    const provider = await this.providerRepo.findOne({ where: { id: providerId } });
    if (!provider) throw new NotFoundException('Provider not found');
    // SCHEDULING_AGENT is cross-practice everywhere else in this app (patient
    // search, dashboard, fill-candidates — see Aug 23 2026 fix in
    // charlene_requirements) — added here Sep 30 2026 when availability/
    // blocks widened to OFFICE_STAFF, since leaving this unchanged would
    // have practice-locked every agent to their own seed practiceId only.
    // PRACTICE_MANAGER is deliberately excluded — the one office role that
    // really is scoped to a single practice.
    const unrestricted = user.role === UserRole.ADMINISTRATOR || user.role === UserRole.SCHEDULING_AGENT;
    if (!unrestricted && provider.practiceId !== user.practiceId) {
      throw new ForbiddenException('Not your practice');
    }
    return provider;
  }

  async getAvailability(providerId: string, user: User) {
    await this.assertCanManage(providerId, user);
    return this.availabilityRepo.find({
      where: { providerId },
      order: { dayOfWeek: 'ASC', startTime: 'ASC' },
    });
  }

  async replaceAvailability(
    providerId: string,
    windows: { dayOfWeek: number; startTime: string; endTime: string }[],
    user: User,
  ) {
    await this.assertCanManage(providerId, user);
    for (const w of windows) {
      if (w.dayOfWeek < 0 || w.dayOfWeek > 6) throw new BadRequestException('dayOfWeek must be 0-6');
      if (w.startTime >= w.endTime) throw new BadRequestException('startTime must be before endTime');
    }
    await this.availabilityRepo.delete({ providerId });
    if (!windows.length) return [];
    const rows = windows.map((w) =>
      this.availabilityRepo.create({
        providerId,
        dayOfWeek: w.dayOfWeek,
        startTime: w.startTime,
        endTime: w.endTime,
        isActive: true,
      }),
    );
    return this.availabilityRepo.save(rows);
  }

  // Workstream B (Oct 3 2026) — provider-specific appointment/service types.
  // Charlene: "I do not want one global list that shows unrelated
  // appointment types across different providers" — every method here is
  // scoped to exactly one providerId, same assertCanManage boundary as
  // availability/blocks above (practice-config-level, not a booking action).
  async listAppointmentTypes(providerId: string, user: User) {
    await this.assertCanManage(providerId, user);
    return this.appointmentTypeRepo.find({ where: { providerId }, order: { name: 'ASC' } });
  }

  async createAppointmentType(
    providerId: string,
    input: { name: string; durationMin: number; category?: string },
    user: User,
  ) {
    await this.assertCanManage(providerId, user);
    const row = this.appointmentTypeRepo.create({
      providerId,
      name: input.name,
      durationMin: input.durationMin,
      category: (input.category as any) ?? undefined,
    });
    return this.appointmentTypeRepo.save(row);
  }

  async updateAppointmentType(
    providerId: string,
    typeId: string,
    input: { name?: string; durationMin?: number; category?: string; isActive?: boolean },
    user: User,
  ) {
    await this.assertCanManage(providerId, user);
    const row = await this.appointmentTypeRepo.findOne({ where: { id: typeId, providerId } });
    if (!row) throw new NotFoundException('Appointment type not found');
    for (const field of ['name', 'durationMin', 'category', 'isActive'] as const) {
      if (input[field] !== undefined) (row as any)[field] = input[field];
    }
    return this.appointmentTypeRepo.save(row);
  }

  // Soft delete (isActive: false), same convention as Practice's "Remove
  // this partner" — existing appointments/waitlist entries already carry
  // this type's id as a foreign key, so a hard delete would either orphan
  // or cascade into real history. A deactivated type just stops appearing
  // as a choice for new bookings.
  async deactivateAppointmentType(providerId: string, typeId: string, user: User) {
    await this.assertCanManage(providerId, user);
    const row = await this.appointmentTypeRepo.findOne({ where: { id: typeId, providerId } });
    if (!row) throw new NotFoundException('Appointment type not found');
    row.isActive = false;
    return this.appointmentTypeRepo.save(row);
  }

  async getBlocksForAdmin(providerId: string, user: User) {
    await this.assertCanManage(providerId, user);
    const now = new Date();
    const sixMonthsOut = new Date(now.getTime() + MAX_RECURRING_WEEKS * 7 * 86_400_000);
    return this.blockRepo.find({
      where: { providerId },
      order: { startAt: 'ASC' },
    }).then((blocks) => blocks.filter((b) => b.endAt >= now && b.startAt <= sixMonthsOut));
  }

  // Recurring blocks (extended Sep 5 2026 — Charlene wanted daily/weekly/
  // monthly cadence plus an explicit end date, not just weekly-capped-at-26).
  // Still not a true recurring *rule* — this generates individual
  // ProviderBlock rows up front, capped at MAX_RECURRING_OCCURRENCES, same
  // trade-off as the original weekly-only version.
  async createRecurringBlock(
    providerId: string,
    input: {
      frequency?: 'daily' | 'weekly' | 'monthly';
      daysOfWeek?: number[];
      dayOfMonth?: number;
      startTime: string;
      endTime: string;
      endDate?: string;
      weeks?: number;
      reason?: string;
    },
    user: User,
  ) {
    await this.assertCanManage(providerId, user);
    const rows = this.buildRecurringOccurrences(providerId, input, user.id);
    return this.blockRepo.save(rows);
  }

  // Same generation used by the admin path above and the provider's own
  // self-service recurring block (self/recurring-block) — the two differ
  // only in how providerId is authorized, not in how occurrences are built.
  private buildRecurringOccurrences(
    providerId: string,
    input: {
      frequency?: 'daily' | 'weekly' | 'monthly';
      daysOfWeek?: number[];
      dayOfMonth?: number;
      startTime: string;
      endTime: string;
      endDate?: string;
      weeks?: number;
      reason?: string;
    },
    createdByUserId: string,
  ): ProviderBlock[] {
    if (input.startTime >= input.endTime) throw new BadRequestException('startTime must be before endTime');
    const frequency = input.frequency ?? 'weekly';

    const [startH, startM] = input.startTime.split(':').map(Number);
    const [endH, endM] = input.endTime.split(':').map(Number);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const explicitEnd = input.endDate ? new Date(input.endDate) : null;
    if (explicitEnd) explicitEnd.setHours(23, 59, 59, 999);

    const occurrenceDates: Date[] = [];

    if (frequency === 'daily') {
      const defaultLimit = new Date(today);
      defaultLimit.setDate(defaultLimit.getDate() + 90);
      const limit = explicitEnd ?? defaultLimit;
      const cursor = new Date(today);
      while (cursor <= limit && occurrenceDates.length < MAX_RECURRING_OCCURRENCES) {
        occurrenceDates.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
    } else if (frequency === 'monthly') {
      const dayOfMonth = input.dayOfMonth ?? today.getDate();
      if (dayOfMonth < 1 || dayOfMonth > 31) throw new BadRequestException('dayOfMonth must be 1-31');
      const defaultLimit = new Date(today);
      defaultLimit.setMonth(defaultLimit.getMonth() + 12);
      const limit = explicitEnd ?? defaultLimit;
      let cursor = new Date(today.getFullYear(), today.getMonth(), dayOfMonth);
      if (cursor < today) cursor = new Date(today.getFullYear(), today.getMonth() + 1, dayOfMonth);
      while (cursor <= limit && occurrenceDates.length < MAX_RECURRING_OCCURRENCES) {
        occurrenceDates.push(new Date(cursor));
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, dayOfMonth);
      }
    } else {
      const daysOfWeek = [...new Set(input.daysOfWeek ?? [])];
      if (daysOfWeek.length === 0 || daysOfWeek.some((d) => d < 0 || d > 6)) {
        throw new BadRequestException('daysOfWeek (0-6, at least one) is required for weekly recurrence');
      }
      const weeksCap = Math.min(Math.max(input.weeks ?? 12, 1), MAX_RECURRING_WEEKS);
      // Each selected weekday gets its own weeksCap-week span measured from
      // its own first occurrence, same as the single-day version — then all
      // days' dates are merged and sorted below. MAX_RECURRING_OCCURRENCES
      // is a shared cap across every day combined, so e.g. 5 days x 12 weeks
      // gets capped to 52 total rows rather than 60.
      for (const dayOfWeek of daysOfWeek) {
        if (occurrenceDates.length >= MAX_RECURRING_OCCURRENCES) break;
        const daysUntilTarget = (dayOfWeek - today.getDay() + 7) % 7;
        const firstOccurrence = new Date(today);
        firstOccurrence.setDate(today.getDate() + daysUntilTarget);
        const defaultLimit = new Date(firstOccurrence);
        defaultLimit.setDate(defaultLimit.getDate() + (weeksCap - 1) * 7);
        const limit = explicitEnd ?? defaultLimit;
        const cursor = new Date(firstOccurrence);
        while (cursor <= limit && occurrenceDates.length < MAX_RECURRING_OCCURRENCES) {
          occurrenceDates.push(new Date(cursor));
          cursor.setDate(cursor.getDate() + 7);
        }
      }
      occurrenceDates.sort((a, b) => a.getTime() - b.getTime());
    }

    return occurrenceDates.map((day) => {
      const startAt = new Date(day);
      startAt.setHours(startH, startM, 0, 0);
      const endAt = new Date(day);
      endAt.setHours(endH, endM, 0, 0);
      return this.blockRepo.create({
        providerId,
        startAt,
        endAt,
        blockType: BlockType.ADMINISTRATIVE,
        reason: input.reason ?? 'Recurring block',
        createdBy: createdByUserId,
      });
    });
  }

  // Provider's own self-service recurring block — no assertCanManage (the
  // provider role has no practiceId to check, see [[project_decisions]]
  // Provider User rows carry no practiceId), authorization comes from
  // resolving providerId off the current user instead.
  async createSelfRecurringBlock(
    user: User,
    input: {
      frequency?: 'daily' | 'weekly' | 'monthly';
      daysOfWeek?: number[];
      dayOfMonth?: number;
      startTime: string;
      endTime: string;
      endDate?: string;
      weeks?: number;
      reason?: string;
    },
  ) {
    const provider = await this.providerRepo.findOne({ where: { userId: user.id } });
    if (!provider) throw new ForbiddenException('Not a provider account');
    const rows = this.buildRecurringOccurrences(provider.id, input, user.id);
    return this.blockRepo.save(rows);
  }

  async deleteBlock(providerId: string, blockId: string, user: User) {
    await this.assertCanManage(providerId, user);
    const block = await this.blockRepo.findOne({ where: { id: blockId, providerId } });
    if (!block) throw new NotFoundException('Block not found');
    await this.blockRepo.remove(block);
    return { success: true };
  }

  async listForUser(user: User, targetPracticeId?: string): Promise<Provider[]> {
    // Admins and agents work across every partner practice — let them scope the
    // list to a specific one (e.g. for a provider-assignment dropdown) on request.
    if (targetPracticeId && (user.role === UserRole.ADMINISTRATOR || user.role === UserRole.SCHEDULING_AGENT)) {
      return this.providerRepo.find({
        where: { practiceId: targetPracticeId } as any,
        order: { lastName: 'ASC' },
      });
    }

    // Unfiltered "list everyone" case (no targetPracticeId) — until Oct 2
    // 2026 this fell through to an assignment-scoped branch for
    // SCHEDULING_AGENT below, predating the Aug 23 2026 decision that
    // agents are cross-practice/unrestricted everywhere, same as admin.
    // Confirmed live: Charlene's account only had AgentProviderAssignment
    // rows for Westside's 2 original providers, so every partner onboarded
    // since (Peace of Mind, Ortiz & Associates) was invisible to her here —
    // same root cause just fixed in dashboard.service.ts's
    // getScopedProviderIds.
    if (user.role === UserRole.ADMINISTRATOR || user.role === UserRole.SCHEDULING_AGENT) {
      // Pre-existing bug, already documented (project_build_state memory):
      // Provider has no `isActive` column at all, only `status`
      // (ACTIVE/INACTIVE/VACATION) — this 500'd for admin too, silently,
      // whenever GET /providers was called with no practiceId filter.
      // Surfaced for real the moment SCHEDULING_AGENT started reaching this
      // same branch (Oct 2 2026) — fixed properly now rather than inherited.
      return this.providerRepo.find({ where: { status: ProviderStatus.ACTIVE }, order: { lastName: 'ASC' } });
    }

    if (user.role === UserRole.PRACTICE_MANAGER) {
      return this.providerRepo.find({
        where: { practiceId: user.practiceId } as any,
        order: { lastName: 'ASC' },
      });
    }

    // Provider sees themselves
    const self = await this.providerRepo.findOne({ where: { userId: user.id } });
    return self ? [self] : [];
  }

  // Real, if narrow, PHI exposure confirmed live Oct 2 2026 during a deep
  // QA pass: this route (@Roles(...ALL_STAFF)) had no ownership check
  // whatsoever — any authenticated staff member, including a provider
  // themselves, could view ANY other provider's real booked appointments
  // (with real patient names) regardless of practice, while the sibling
  // getAvailability/getBlocks already correctly enforce assertCanManage's
  // practice confinement. assertCanManage itself isn't reused here as-is —
  // it compares provider.practiceId to the CALLER's own practiceId, which
  // is null for every PROVIDER-role user (their practice lives on the
  // Provider record, not the User row — see tickets.service.ts's identical
  // comment), so it would incorrectly block every provider from viewing
  // even their own schedule. Providers get a stricter, separate check here:
  // only their own schedule, not "same practice."
  // Shared by getSchedule and getAppointmentDetail — see the long comment
  // above for why assertCanManage itself can't be reused here as-is.
  private async assertScheduleAccess(providerId: string, user?: User): Promise<void> {
    if (!user) return;
    if (user.role === UserRole.PRACTICE_MANAGER) {
      const target = await this.providerRepo.findOne({ where: { id: providerId } });
      if (!target || target.practiceId !== user.practiceId) {
        throw new ForbiddenException('Not your practice');
      }
    } else if (user.role === UserRole.PROVIDER) {
      const self = await this.providerRepo.findOne({ where: { userId: user.id } });
      if (!self || self.id !== providerId) {
        throw new ForbiddenException('Not your schedule');
      }
    }
    // ADMINISTRATOR and SCHEDULING_AGENT stay unrestricted, matching
    // assertCanManage's convention everywhere else in this file.
  }

  async getSchedule(providerId: string, date?: string, user?: User): Promise<any[]> {
    await this.assertScheduleAccess(providerId, user);

    const target = date ? new Date(date + 'T00:00:00') : new Date();
    const start = new Date(target);
    start.setHours(0, 0, 0, 0);
    const end = new Date(target);
    end.setHours(23, 59, 59, 999);

    const [appointments, externalBlocks] = await Promise.all([
      this.appointmentRepo.find({
        where: {
          providerId,
          startAt: Between(start, end),
        },
        relations: { patient: true, appointmentType: true },
        order: { startAt: 'ASC' },
      }),
      // Synced Rula/Headway busy blocks (Sep 29 2026) — shown alongside real
      // Nestyvo appointments so a provider/admin sees their actual full day,
      // not just the Nestyvo-booked half of it. No `patient` field: the
      // source feed itself carries no patient PHI, `summary` is already the
      // generic label the source platform gives it (e.g. "Rula - existing
      // client appointment"). See ExternalCalendarSyncService.
      this.externalBlockRepo.find({ where: { providerId, startAt: Between(start, end) } }),
    ]);

    const nestyvoRows = appointments.map((a) => ({
      id: a.id,
      startAt: a.startAt,
      endAt: a.endAt,
      patientId: a.patientId,
      patient: `${a.patient.firstName} ${a.patient.lastName}`,
      type: a.appointmentType?.name,
      status: a.status,
      locationType: a.locationType,
      source: 'nestyvo' as const,
    }));
    const externalRows = externalBlocks.map((b) => ({
      id: b.id,
      startAt: b.startAt,
      endAt: b.endAt,
      patient: null,
      type: b.summary,
      status: null,
      locationType: null,
      source: 'external' as const,
      externalSource: b.source,
    }));

    return [...nestyvoRows, ...externalRows].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }

  // Phase 0 audit (Oct 2 2026) / Workstream A (Oct 3 2026) — the one thing
  // missing for "Calendar -> Appointment -> Client/Provider continuity" on
  // the agent/admin side: a single real appointment, full detail, for the
  // new appointment-detail screen. Same ownership check as getSchedule
  // (reused, not re-derived) since this is the same trust boundary.
  async getAppointmentDetail(providerId: string, appointmentId: string, user?: User): Promise<any> {
    await this.assertScheduleAccess(providerId, user);

    const appt = await this.appointmentRepo.findOne({
      where: { id: appointmentId, providerId },
      relations: { patient: true, provider: { practice: true }, appointmentType: true },
    });
    if (!appt) throw new NotFoundException('Appointment not found');

    return {
      id: appt.id,
      startAt: appt.startAt,
      endAt: appt.endAt,
      status: appt.status,
      locationType: appt.locationType,
      cancellationReason: appt.cancellationReason,
      rescheduledFromId: appt.rescheduledFromId,
      patient: { id: appt.patient.id, name: `${appt.patient.firstName} ${appt.patient.lastName}`, phone: appt.patient.phone, email: appt.patient.email },
      provider: { id: appt.provider.id, name: `${appt.provider.firstName} ${appt.provider.lastName}` },
      practice: { id: appt.provider.practice.id, name: appt.provider.practice.name },
      appointmentType: appt.appointmentType ? { id: appt.appointmentType.id, name: appt.appointmentType.name, durationMin: appt.appointmentType.durationMin } : null,
    };
  }

  async findByUserId(userId: string): Promise<Provider | null> {
    return this.providerRepo.findOne({ where: { userId } });
  }

  // Generates the token on first request rather than at provider creation —
  // most providers will never use this, no reason to mint tokens for
  // everyone up front.
  async getOrCreateCalendarFeedToken(user: User): Promise<string> {
    const provider = await this.providerRepo.findOne({ where: { userId: user.id } });
    if (!provider) throw new ForbiddenException('Not a provider account');
    if (!provider.calendarFeedToken) {
      provider.calendarFeedToken = randomBytes(24).toString('hex');
      await this.providerRepo.save(provider);
    }
    return provider.calendarFeedToken;
  }
}
