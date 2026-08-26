import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket, TicketCategory, TicketPriority, TicketStatus } from '../../database/entities/ticket.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { Provider } from '../../database/entities/provider.entity';

const OFFICE_ROLES = [UserRole.ADMINISTRATOR, UserRole.PRACTICE_MANAGER];

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket) private ticketRepo: Repository<Ticket>,
    @InjectRepository(Provider) private providerRepo: Repository<Provider>,
  ) {}

  create(
    input: { patientId?: string; category: TicketCategory; priority?: TicketPriority; subject: string; description: string },
    user: User,
  ) {
    return this.ticketRepo.save(
      this.ticketRepo.create({
        practiceId: user.practiceId,
        patientId: input.patientId ?? null,
        category: input.category,
        priority: input.priority ?? TicketPriority.NORMAL,
        subject: input.subject,
        description: input.description,
        createdByUserId: user.id,
      }),
    );
  }

  async list(status: TicketStatus | undefined, patientId: string | undefined, user: User) {
    const isOffice = OFFICE_ROLES.includes(user.role);
    const where: any = {};
    if (status) where.status = status;
    if (patientId) where.patientId = patientId;

    if (user.role === UserRole.PROVIDER) {
      // Providers don't carry a practiceId on their User row — theirs lives
      // on the Provider record, and scoping by assignedProviderId already
      // implies the correct practice.
      const provider = await this.providerRepo.findOne({ where: { userId: user.id } });
      if (!provider) return [];
      where.patient = { assignedProviderId: provider.id };
    } else {
      where.practiceId = user.practiceId;
      if (!isOffice) where.createdByUserId = user.id;
    }

    return this.ticketRepo.find({
      where,
      relations: { patient: true, createdByUser: true, assignedToUser: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, user: User) {
    const isProvider = user.role === UserRole.PROVIDER;
    const ticket = await this.ticketRepo.findOne({
      where: isProvider ? { id } : { id, practiceId: user.practiceId },
      relations: { patient: true, createdByUser: true, assignedToUser: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    if (isProvider) {
      const provider = await this.providerRepo.findOne({ where: { userId: user.id } });
      if (!provider || ticket.patient?.assignedProviderId !== provider.id) {
        throw new ForbiddenException('Not one of your patients');
      }
    } else if (!OFFICE_ROLES.includes(user.role) && ticket.createdByUserId !== user.id) {
      throw new ForbiddenException('Not your ticket');
    }
    return ticket;
  }

  async update(
    id: string,
    updates: { status?: TicketStatus; assignedToUserId?: string | null; resolutionNotes?: string },
    user: User,
  ) {
    const ticket = await this.ticketRepo.findOne({ where: { id, practiceId: user.practiceId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const isOffice = OFFICE_ROLES.includes(user.role);
    if (!isOffice && ticket.createdByUserId !== user.id) {
      throw new ForbiddenException('Not your ticket');
    }

    if (updates.status !== undefined) {
      ticket.status = updates.status;
      if (updates.status === TicketStatus.RESOLVED || updates.status === TicketStatus.CLOSED) {
        ticket.resolvedAt = new Date();
      }
    }
    if (updates.assignedToUserId !== undefined) ticket.assignedToUserId = updates.assignedToUserId;
    if (updates.resolutionNotes !== undefined) ticket.resolutionNotes = updates.resolutionNotes;

    return this.ticketRepo.save(ticket);
  }
}
