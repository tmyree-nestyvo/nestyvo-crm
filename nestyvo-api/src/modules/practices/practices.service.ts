import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Practice, SubscriptionStatus } from '../../database/entities/practice.entity';

export interface UpsertPracticeInput {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  contactName?: string;
  notes?: string;
  timezone?: string;
  subscriptionStatus?: SubscriptionStatus;
  subscriptionExpiresAt?: string | null;
}

@Injectable()
export class PracticesService {
  constructor(@InjectRepository(Practice) private practiceRepo: Repository<Practice>) {}

  // Minimal fields for pickers (New Client's practice dropdown, provider
  // settings' partner picker) — unchanged shape, existing callers depend on it.
  list() {
    return this.practiceRepo.find({
      where: { isActive: true },
      select: { id: true, name: true },
      order: { name: 'ASC' },
    });
  }

  // Full fields, admin partner-management screen only. Filters to active so
  // a removed partner (see remove()) disappears from the Partners screen.
  listAdmin() {
    return this.practiceRepo.find({ where: { isActive: true }, order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<Practice> {
    const practice = await this.practiceRepo.findOne({ where: { id } });
    if (!practice) throw new NotFoundException('Practice not found');
    return practice;
  }

  create(input: UpsertPracticeInput) {
    const practice = this.practiceRepo.create({
      name: input.name,
      address: input.address,
      phone: input.phone,
      email: input.email,
      contactName: input.contactName,
      notes: input.notes,
      timezone: input.timezone ?? 'America/Los_Angeles',
      subscriptionStatus: input.subscriptionStatus ?? SubscriptionStatus.TRIAL,
      subscriptionExpiresAt: input.subscriptionExpiresAt ?? null,
    });
    return this.practiceRepo.save(practice);
  }

  async update(id: string, input: Partial<UpsertPracticeInput>) {
    const practice = await this.findOne(id);
    Object.assign(practice, input);
    return this.practiceRepo.save(practice);
  }

  // Charlene (Sep 30 2026) wants partners she no longer works with out of
  // her system. Deliberately a soft delete: a practice has providers,
  // patients, appointments and tickets hanging off it, and cascading all of
  // that away on one tap is unrecoverable. Flipping isActive removes it from
  // every picker and from the Partners screen (both list() and listAdmin()
  // filter on it) while leaving history intact — a mistaken delete is fixed
  // by flipping the flag back, not by restoring a backup.
  async remove(id: string) {
    const practice = await this.findOne(id);
    practice.isActive = false;
    await this.practiceRepo.save(practice);
    return { success: true, id };
  }
}
