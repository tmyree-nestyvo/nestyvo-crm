import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientTag } from '../../database/entities/client-tag.entity';
import { User, UserRole } from '../../database/entities/user.entity';

@Injectable()
export class ClientTagsService {
  constructor(@InjectRepository(ClientTag) private tagRepo: Repository<ClientTag>) {}

  list(user: User, targetPracticeId?: string) {
    // GET /client-tags is OFFICE_STAFF (includes SCHEDULING_AGENT) — only
    // ADMINISTRATOR could actually use targetPracticeId though, so an agent
    // viewing/assigning tags for a patient outside their home practice
    // (e.g. a Peace of Mind patient while seeded under Westside) silently
    // got Westside's tag set instead of the one that actually applied.
    // create/update/remove stay PRACTICE_MANAGEMENT-only at the controller
    // level (Aug 21 2026 decision: tag *definitions* stay admin-controlled)
    // — this only widens read access, matching how assignment already works.
    const isCrossPractice = user.role === UserRole.ADMINISTRATOR || user.role === UserRole.SCHEDULING_AGENT;
    const practiceId = targetPracticeId && isCrossPractice ? targetPracticeId : user.practiceId;
    return this.tagRepo.find({
      where: { practiceId, isActive: true },
      order: { blockMinutes: 'ASC' },
    });
  }

  create(name: string, blockMinutes: number, user: User) {
    return this.tagRepo.save(this.tagRepo.create({ practiceId: user.practiceId, name, blockMinutes }));
  }

  async update(id: string, updates: { name?: string; blockMinutes?: number; isActive?: boolean }, user: User) {
    const tag = await this.tagRepo.findOne({ where: { id, practiceId: user.practiceId } });
    if (!tag) throw new NotFoundException('Tag not found');
    Object.assign(tag, updates);
    return this.tagRepo.save(tag);
  }

  async remove(id: string, user: User) {
    const tag = await this.tagRepo.findOne({ where: { id, practiceId: user.practiceId } });
    if (!tag) throw new NotFoundException('Tag not found');
    await this.tagRepo.remove(tag);
    return { success: true };
  }
}
