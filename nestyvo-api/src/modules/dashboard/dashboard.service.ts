import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Between } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { Provider } from '../../database/entities/provider.entity';
import { Appointment, AppointmentStatus } from '../../database/entities/appointment.entity';
import { FillOpportunity, FillOpportunityStatus } from '../../database/entities/fill-opportunity.entity';
import { WaitlistEntry, WaitlistEntryStatus } from '../../database/entities/waitlist-entry.entity';
import { CallbackRequest, CallbackStatus } from '../../database/entities/callback-request.entity';
import { AgentProviderAssignment } from '../../database/entities/agent-provider-assignment.entity';
import { ProviderAvailability } from '../../database/entities/provider-availability.entity';
import { ProviderBlock } from '../../database/entities/provider-block.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Appointment) private appointmentRepo: Repository<Appointment>,
    @InjectRepository(Provider) private providerRepo: Repository<Provider>,
    @InjectRepository(FillOpportunity) private fillOpRepo: Repository<FillOpportunity>,
    @InjectRepository(WaitlistEntry) private waitlistRepo: Repository<WaitlistEntry>,
    @InjectRepository(CallbackRequest) private callbackRepo: Repository<CallbackRequest>,
    @InjectRepository(AgentProviderAssignment) private assignmentRepo: Repository<AgentProviderAssignment>,
    @InjectRepository(ProviderAvailability) private availabilityRepo: Repository<ProviderAvailability>,
    @InjectRepository(ProviderBlock) private blockRepo: Repository<ProviderBlock>,
  ) {}

  async getAgentDashboard(user: User): Promise<any> {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const thirtyDaysOut = new Date(startOfToday);
    thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);

    const assignments = await this.assignmentRepo.find({
      where: { agentUserId: user.id, isActive: true },
    });
    const providerIds = assignments.map((a) => a.providerId);

    if (!providerIds.length) {
      return { totalOpenSlots: 0, openCallbacks: 0, openCancellations: 0, waitlistOpportunities: 0, providers: [] };
    }

    const [providers, bookedRange, allBlocks, openCancellations, waitlistOpportunities, openCallbacks] =
      await Promise.all([
        this.providerRepo.findBy({ id: In(providerIds) }),

        // All booked appointments in the 30-day window
        this.appointmentRepo.find({
          where: {
            providerId: In(providerIds),
            startAt: Between(startOfToday, thirtyDaysOut),
            status: In([AppointmentStatus.SCHEDULED, AppointmentStatus.COMPLETED]),
          },
        }),

        // All blocks in the 30-day window
        this.blockRepo.find({
          where: {
            providerId: In(providerIds),
            startAt: Between(startOfToday, thirtyDaysOut),
          },
        }),

        this.fillOpRepo.count({
          where: { providerId: In(providerIds), status: FillOpportunityStatus.OPEN },
        }),

        this.waitlistRepo.count({
          where: { providerId: In(providerIds), status: WaitlistEntryStatus.ACTIVE },
        }),

        this.callbackRepo.count({
          where: { assignedAgentId: user.id, status: In([CallbackStatus.OPEN, CallbackStatus.OVERDUE]) },
        }),
      ]);

    // All availability records for assigned providers (recurring weekly)
    const allAvailability = await this.availabilityRepo.find({
      where: { providerId: In(providerIds), isActive: true },
    });

    // Build per-provider slot data grouped by date
    const providerData = providers.map((provider) => {
      const availability = allAvailability.filter((a) => a.providerId === provider.id);
      const booked = bookedRange.filter((a) => a.providerId === provider.id);
      const blocks = allBlocks.filter((b) => b.providerId === provider.id);

      const slotsByDate = computeSlotsByDate(
        provider.id,
        startOfToday,
        thirtyDaysOut,
        now,
        availability,
        booked,
        blocks,
      );

      const totalSlots = slotsByDate.reduce((sum, d) => sum + d.slots.length, 0);

      return {
        id: provider.id,
        name: `${provider.firstName} ${provider.lastName}`,
        credentials: provider.credentials,
        status: provider.status,
        openSlotCount: totalSlots,
        slotsByDate,
      };
    });

    const totalOpenSlots = providerData.reduce((sum, p) => sum + p.openSlotCount, 0);

    return {
      totalOpenSlots,
      openCallbacks,
      openCancellations,
      waitlistOpportunities,
      providers: providerData,
    };
  }

  async getProviderDashboard(user: User): Promise<any> {
    const provider = await this.providerRepo.findOne({ where: { userId: user.id } });
    if (!provider) return { availableSlots: 0, waitlistCount: 0, utilizationRate: 0, cancellationCount: 0, schedule: [] };

    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const sevenDaysOut = new Date(startOfToday); sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
    const startOfWeek = new Date(startOfToday); startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

    const [schedule, waitlistCount, weekCancellations] = await Promise.all([
      this.appointmentRepo.find({
        where: { providerId: provider.id, startAt: Between(startOfToday, sevenDaysOut), status: AppointmentStatus.SCHEDULED },
        relations: { patient: true, appointmentType: true },
        order: { startAt: 'ASC' },
      }),
      this.waitlistRepo.count({ where: { providerId: provider.id, status: WaitlistEntryStatus.ACTIVE } }),
      this.appointmentRepo.count({
        where: { providerId: provider.id, status: AppointmentStatus.CANCELLED, cancelledAt: Between(startOfWeek, new Date()) },
      }),
    ]);

    const weeklyAvailability = await this.availabilityRepo.find({ where: { providerId: provider.id, isActive: true } });
    const totalWeeklyMinutes = weeklyAvailability.reduce((acc, a) => {
      const [sh, sm] = a.startTime.split(':').map(Number);
      const [eh, em] = a.endTime.split(':').map(Number);
      return acc + (eh * 60 + em) - (sh * 60 + sm);
    }, 0);
    const bookedMinutes = schedule.reduce((acc, a) => acc + (new Date(a.endAt).getTime() - new Date(a.startAt).getTime()) / 60_000, 0);
    const utilizationRate = totalWeeklyMinutes > 0 ? Math.round((bookedMinutes / totalWeeklyMinutes) * 100) : 0;
    const availableSlots = totalWeeklyMinutes > 0 ? Math.max(0, Math.floor((totalWeeklyMinutes - bookedMinutes) / 50)) : 0;

    return {
      availableSlots,
      waitlistCount,
      utilizationRate: Math.min(utilizationRate, 100),
      cancellationCount: weekCancellations,
      schedule: schedule.map((a) => ({
        id: a.id, startAt: a.startAt, endAt: a.endAt,
        patient: `${a.patient.firstName} ${a.patient.lastName}`,
        type: a.appointmentType?.name, status: a.status, locationType: a.locationType,
      })),
    };
  }
}

// Build 50-min open slots for each day in the range, grouped by date
function computeSlotsByDate(
  providerId: string,
  start: Date,
  end: Date,
  now: Date,
  availability: ProviderAvailability[],
  booked: Appointment[],
  blocks: ProviderBlock[],
  slotMin = 50,
): { date: string; dateLabel: string; slots: { startAt: string; endAt: string; durationMin: number }[] }[] {
  const results: ReturnType<typeof computeSlotsByDate> = [];
  const cursor = new Date(start);

  while (cursor < end) {
    const dow = cursor.getDay();
    const dayAvailability = availability.filter((a) => a.dayOfWeek === dow);
    const slots: { startAt: string; endAt: string; durationMin: number }[] = [];

    for (const avail of dayAvailability) {
      const [sh, sm] = avail.startTime.split(':').map(Number);
      const [eh, em] = avail.endTime.split(':').map(Number);
      let slotStart = new Date(cursor);
      slotStart.setHours(sh, sm, 0, 0);
      const windowEnd = new Date(cursor);
      windowEnd.setHours(eh, em, 0, 0);

      while (slotStart.getTime() + slotMin * 60_000 <= windowEnd.getTime()) {
        const slotEnd = new Date(slotStart.getTime() + slotMin * 60_000);
        const isBooked = booked.some((a) => slotStart < new Date(a.endAt) && slotEnd > new Date(a.startAt));
        const isBlocked = blocks.some((b) => slotStart < b.endAt && slotEnd > b.startAt);
        const isPast = slotEnd <= now;

        if (!isBooked && !isBlocked && !isPast) {
          slots.push({ startAt: slotStart.toISOString(), endAt: slotEnd.toISOString(), durationMin: slotMin });
        }
        slotStart = slotEnd;
      }
    }

    if (slots.length > 0) {
      const dateStr = cursor.toISOString().split('T')[0];
      results.push({ date: dateStr, dateLabel: makeDateLabel(cursor, now), slots });
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return results;
}

function makeDateLabel(date: Date, now: Date): string {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
