import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Between } from 'typeorm';
import { randomBytes } from 'crypto';
import { Provider } from '../../database/entities/provider.entity';
import { Appointment, AppointmentStatus } from '../../database/entities/appointment.entity';
import { AgentProviderAssignment } from '../../database/entities/agent-provider-assignment.entity';
import { ProviderAvailability } from '../../database/entities/provider-availability.entity';
import { ProviderBlock, BlockType } from '../../database/entities/provider-block.entity';
import { User, UserRole } from '../../database/entities/user.entity';

const MAX_RECURRING_WEEKS = 26;
const MAX_RECURRING_OCCURRENCES = 52;

@Injectable()
export class ProvidersService {
  constructor(
    @InjectRepository(Provider) private providerRepo: Repository<Provider>,
    @InjectRepository(Appointment) private appointmentRepo: Repository<Appointment>,
    @InjectRepository(AgentProviderAssignment) private assignmentRepo: Repository<AgentProviderAssignment>,
    @InjectRepository(ProviderAvailability) private availabilityRepo: Repository<ProviderAvailability>,
    @InjectRepository(ProviderBlock) private blockRepo: Repository<ProviderBlock>,
  ) {}

  // Admins manage every partner; practice managers only their own practice.
  private async assertCanManage(providerId: string, user: User): Promise<Provider> {
    const provider = await this.providerRepo.findOne({ where: { id: providerId } });
    if (!provider) throw new NotFoundException('Provider not found');
    if (user.role !== UserRole.ADMINISTRATOR && provider.practiceId !== user.practiceId) {
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
      dayOfWeek?: number;
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
      dayOfWeek?: number;
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
      if (input.dayOfWeek === undefined || input.dayOfWeek < 0 || input.dayOfWeek > 6) {
        throw new BadRequestException('dayOfWeek (0-6) is required for weekly recurrence');
      }
      const weeksCap = Math.min(Math.max(input.weeks ?? 12, 1), MAX_RECURRING_WEEKS);
      const daysUntilTarget = (input.dayOfWeek - today.getDay() + 7) % 7;
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
      dayOfWeek?: number;
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

    if (user.role === UserRole.ADMINISTRATOR) {
      return this.providerRepo.find({ where: { isActive: true } as any, order: { lastName: 'ASC' } });
    }

    if (user.role === UserRole.PRACTICE_MANAGER) {
      return this.providerRepo.find({
        where: { practiceId: user.practiceId } as any,
        order: { lastName: 'ASC' },
      });
    }

    if (user.role === UserRole.SCHEDULING_AGENT) {
      const assignments = await this.assignmentRepo.find({
        where: { agentUserId: user.id, isActive: true },
      });
      if (!assignments.length) return [];
      return this.providerRepo.findBy({ id: In(assignments.map((a) => a.providerId)) });
    }

    // Provider sees themselves
    const self = await this.providerRepo.findOne({ where: { userId: user.id } });
    return self ? [self] : [];
  }

  async getSchedule(providerId: string, date?: string): Promise<any[]> {
    const target = date ? new Date(date + 'T00:00:00') : new Date();
    const start = new Date(target);
    start.setHours(0, 0, 0, 0);
    const end = new Date(target);
    end.setHours(23, 59, 59, 999);

    const appointments = await this.appointmentRepo.find({
      where: {
        providerId,
        startAt: Between(start, end),
      },
      relations: { patient: true, appointmentType: true },
      order: { startAt: 'ASC' },
    });

    return appointments.map((a) => ({
      id: a.id,
      startAt: a.startAt,
      endAt: a.endAt,
      patient: `${a.patient.firstName} ${a.patient.lastName}`,
      type: a.appointmentType?.name,
      status: a.status,
      locationType: a.locationType,
    }));
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
