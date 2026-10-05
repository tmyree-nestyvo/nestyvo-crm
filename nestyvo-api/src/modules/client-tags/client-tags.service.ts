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

  // Charlene, Oct 5 2026 — "Admin AND Agent users must be able to create
  // new custom client tag names." Widening the @Roles() alone would have
  // been wrong on its own: ADMINISTRATOR and SCHEDULING_AGENT carry
  // practiceId: null on their own User row (same reason providers.service
  // .ts's targetPracticeId branches exist) — using user.practiceId
  // directly here would have silently created an orphaned tag no one
  // could ever see again. Same targetPracticeId-for-cross-practice-roles
  // pattern this file's own list() already established, applied to the
  // three write methods too.
  private resolvePracticeId(user: User, targetPracticeId?: string): string {
    const isCrossPractice = user.role === UserRole.ADMINISTRATOR || user.role === UserRole.SCHEDULING_AGENT;
    const practiceId = isCrossPractice ? targetPracticeId : user.practiceId;
    if (!practiceId) throw new NotFoundException('A practice must be selected.');
    return practiceId;
  }

  create(name: string, blockMinutes: number, user: User, targetPracticeId?: string) {
    const practiceId = this.resolvePracticeId(user, targetPracticeId);
    return this.tagRepo.save(this.tagRepo.create({ practiceId, name, blockMinutes }));
  }

  async update(
    id: string,
    updates: { name?: string; blockMinutes?: number; isActive?: boolean },
    user: User,
    targetPracticeId?: string,
  ) {
    const practiceId = this.resolvePracticeId(user, targetPracticeId);
    const tag = await this.tagRepo.findOne({ where: { id, practiceId } });
    if (!tag) throw new NotFoundException('Tag not found');
    Object.assign(tag, updates);
    return this.tagRepo.save(tag);
  }

  async remove(id: string, user: User, targetPracticeId?: string) {
    const practiceId = this.resolvePracticeId(user, targetPracticeId);
    const tag = await this.tagRepo.findOne({ where: { id, practiceId } });
    if (!tag) throw new NotFoundException('Tag not found');
    await this.tagRepo.remove(tag);
    return { success: true };
  }
}
