import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Between } from 'typeorm';
import { Provider } from '../../database/entities/provider.entity';
import { Appointment, AppointmentStatus } from '../../database/entities/appointment.entity';
import { AgentProviderAssignment } from '../../database/entities/agent-provider-assignment.entity';
import { ProviderAvailability } from '../../database/entities/provider-availability.entity';
import { ProviderBlock, BlockType } from '../../database/entities/provider-block.entity';
import { User, UserRole } from '../../database/entities/user.entity';

const MAX_RECURRING_WEEKS = 26;

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

  async createRecurringBlock(
    providerId: string,
    input: { dayOfWeek: number; startTime: string; endTime: string; weeks: number; reason?: string },
    user: User,
  ) {
    await this.assertCanManage(providerId, user);
    if (input.dayOfWeek < 0 || input.dayOfWeek > 6) throw new BadRequestException('dayOfWeek must be 0-6');
    if (input.startTime >= input.endTime) throw new BadRequestException('startTime must be before endTime');
    const weeks = Math.min(Math.max(input.weeks ?? 12, 1), MAX_RECURRING_WEEKS);

    const [startH, startM] = input.startTime.split(':').map(Number);
    const [endH, endM] = input.endTime.split(':').map(Number);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysUntilTarget = (input.dayOfWeek - today.getDay() + 7) % 7;
    const firstOccurrence = new Date(today);
    firstOccurrence.setDate(today.getDate() + daysUntilTarget);

    const rows: ProviderBlock[] = [];
    for (let i = 0; i < weeks; i++) {
      const day = new Date(firstOccurrence);
      day.setDate(firstOccurrence.getDate() + i * 7);
      const startAt = new Date(day);
      startAt.setHours(startH, startM, 0, 0);
      const endAt = new Date(day);
      endAt.setHours(endH, endM, 0, 0);
      rows.push(
        this.blockRepo.create({
          providerId,
          startAt,
          endAt,
          blockType: BlockType.ADMINISTRATIVE,
          reason: input.reason ?? 'Recurring block',
          createdBy: user.id,
        }),
      );
    }
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
}
