import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Practice } from '../../database/entities/practice.entity';

@Injectable()
export class PracticesService {
  constructor(@InjectRepository(Practice) private practiceRepo: Repository<Practice>) {}

  list() {
    return this.practiceRepo.find({
      where: { isActive: true },
      select: { id: true, name: true },
      order: { name: 'ASC' },
    });
  }
}
