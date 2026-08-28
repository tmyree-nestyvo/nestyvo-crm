import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WaitlistEntry, WaitlistEntryStatus, WaitlistType } from '../../database/entities/waitlist-entry.entity';
import { Provider } from '../../database/entities/provider.entity';
import { User, UserRole } from '../../database/entities/user.entity';

@Injectable()
export class WaitlistService {
  constructor(
    @InjectRepository(WaitlistEntry) private waitlistRepo: Repository<WaitlistEntry>,
    @InjectRepository(Provider) private providerRepo: Repository<Provider>,
  ) {}

  async addEntry(
    input: {
      patientId: string;
      providerId?: string;
      waitlistType: WaitlistType;
      preferredDays?: number[];
      preferredTimes?: Record<string, boolean>;
      notes?: string;
    },
    user: User,
  ) {
    let providerId = input.providerId;

    // Providers can only add to their own waitlist — ignore whatever
    // providerId came from the client and use their own record instead.
    if (user.role === UserRole.PROVIDER) {
      const own = await this.providerRepo.findOne({ where: { userId: user.id } });
      if (!own) throw new BadRequestException('Not a provider account');
      providerId = own.id;
    }
    if (!providerId) throw new BadRequestException('providerId is required');

    const entry = this.waitlistRepo.create({
      patientId: input.patientId,
      providerId,
      waitlistType: input.waitlistType ?? WaitlistType.FOLLOWUP,
      preferredDays: input.preferredDays,
      preferredTimes: input.preferredTimes,
      notes: input.notes,
      dateAdded: new Date(),
      createdBy: user.id,
    });
    const saved = await this.waitlistRepo.save(entry);
    return { id: saved.id };
  }

  async getForProvider(user: User): Promise<any[]> {
    const provider = await this.providerRepo.findOne({ where: { userId: user.id } });
    if (!provider) return [];

    const entries = await this.waitlistRepo.find({
      where: { providerId: provider.id, status: WaitlistEntryStatus.ACTIVE },
      relations: { patient: true, appointmentType: true },
      order: { priorityScore: 'DESC', dateAdded: 'ASC' },
    });

    return entries.map((e) => ({
      id: e.id,
      patient: `${e.patient.firstName} ${e.patient.lastName}`,
      type: e.waitlistType,
      appointmentType: e.appointmentType?.name,
      daysWaiting: Math.floor((Date.now() - new Date(e.dateAdded).getTime()) / 86_400_000),
      preferredDays: e.preferredDays,
      preferredTimes: e.preferredTimes,
      priorityScore: e.priorityScore,
    }));
  }

  async getForProviderById(providerId: string): Promise<any[]> {
    const entries = await this.waitlistRepo.find({
      where: { providerId, status: WaitlistEntryStatus.ACTIVE },
      relations: { patient: true, appointmentType: true },
      order: { priorityScore: 'DESC', dateAdded: 'ASC' },
    });

    return entries.map((e) => ({
      id: e.id,
      patient: `${e.patient.firstName} ${e.patient.lastName}`,
      type: e.waitlistType,
      appointmentType: e.appointmentType?.name,
      daysWaiting: Math.floor((Date.now() - new Date(e.dateAdded).getTime()) / 86_400_000),
      preferredDays: e.preferredDays,
      preferredTimes: e.preferredTimes,
    }));
  }

  async countForProvider(providerId: string): Promise<number> {
    return this.waitlistRepo.count({
      where: { providerId, status: WaitlistEntryStatus.ACTIVE },
    });
  }
}
