import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientTag } from '../../database/entities/client-tag.entity';
import { User } from '../../database/entities/user.entity';

@Injectable()
export class ClientTagsService {
  constructor(@InjectRepository(ClientTag) private tagRepo: Repository<ClientTag>) {}

  list(user: User) {
    return this.tagRepo.find({
      where: { practiceId: user.practiceId, isActive: true },
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
