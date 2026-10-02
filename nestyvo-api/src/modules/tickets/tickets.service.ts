import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In } from 'typeorm';
import { Ticket, TicketCategory, TicketPriority, TicketStatus } from '../../database/entities/ticket.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { Provider } from '../../database/entities/provider.entity';
import { Patient } from '../../database/entities/patient.entity';

// "Can see every practice's tickets" (not just their own created ones
// within one practice) vs. "is cross-practice at all" turned out to be two
// different questions, conflated here until Oct 2 2026 — see isCrossPractice.
const OFFICE_ROLES = [UserRole.ADMINISTRATOR, UserRole.PRACTICE_MANAGER];

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket) private ticketRepo: Repository<Ticket>,
    @InjectRepository(Provider) private providerRepo: Repository<Provider>,
    @InjectRepository(Patient) private patientRepo: Repository<Patient>,
  ) {}

  // SCHEDULING_AGENT is cross-practice/unrestricted everywhere else in this
  // app since Aug 23 2026 (search, dashboard, fill-candidates, provider
  // listings — see charlene_requirements memory and the identical fix just
  // made in dashboard/providers services) — this whole file never got that
  // treatment at all. Confirmed live Oct 2 2026: Charlene (scheduling_agent)
  // couldn't see, open, or resolve tickets for any practice beyond her
  // seeded home one (Westside), even though OFFICE_ROLES already let her
  // see every ticket *within* that one practice.
  private isCrossPractice(user: User): boolean {
    return user.role === UserRole.ADMINISTRATOR || user.role === UserRole.SCHEDULING_AGENT;
  }

  async create(
    input: { patientId?: string; category: TicketCategory; priority?: TicketPriority; subject: string; description: string },
    user: User,
  ) {
    let practiceId = user.practiceId;
    if (user.role === UserRole.PROVIDER) {
      const provider = await this.providerRepo.findOne({ where: { userId: user.id } });
      if (!provider) throw new ForbiddenException('Not a provider account');
      practiceId = provider.practiceId;
    } else if (input.patientId) {
      // A cross-practice agent filing a ticket about a specific patient
      // (e.g. "call this patient") was always filed under the AGENT's own
      // home practice regardless of whose patient it actually was — the
      // patient's real practice is the correct one to file it under.
      const patient = await this.patientRepo.findOne({ where: { id: input.patientId } });
      if (patient) practiceId = patient.practiceId;
    }

    return this.ticketRepo.save(
      this.ticketRepo.create({
        practiceId,
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
    // No status filter = "Open" view: active tickets only. Resolved/closed
    // ones drop out of the default list and only show when explicitly
    // filtered for (matches Charlene's Sep 5 ask — resolved tickets should
    // disappear from the open list, not stay mixed in).
    if (status) where.status = status;
    else where.status = Not(In([TicketStatus.RESOLVED, TicketStatus.CLOSED]));
    if (patientId) where.patientId = patientId;

    if (user.role === UserRole.PROVIDER) {
      // Providers don't carry a practiceId on their User row — theirs lives
      // on the Provider record, and scoping by assignedProviderId already
      // implies the correct practice.
      const provider = await this.providerRepo.findOne({ where: { userId: user.id } });
      if (!provider) return [];
      where.patient = { assignedProviderId: provider.id };
    } else if (!this.isCrossPractice(user)) {
      where.practiceId = user.practiceId;
      if (!isOffice) where.createdByUserId = user.id;
    }
    // else: admin/scheduling_agent — no practiceId filter at all, every
    // practice's tickets (isOffice is also always true for ADMINISTRATOR,
    // and SCHEDULING_AGENT already saw every ticket within one practice —
    // this just removes the practice boundary itself).

    return this.ticketRepo.find({
      where,
      relations: { patient: true, createdByUser: true, assignedToUser: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, user: User) {
    const isProvider = user.role === UserRole.PROVIDER;
    const scoped = !isProvider && !this.isCrossPractice(user);
    const ticket = await this.ticketRepo.findOne({
      where: scoped ? { id, practiceId: user.practiceId } : { id },
      relations: { patient: true, createdByUser: true, assignedToUser: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    if (isProvider) {
      const provider = await this.providerRepo.findOne({ where: { userId: user.id } });
      if (!provider || ticket.patient?.assignedProviderId !== provider.id) {
        throw new ForbiddenException('Not one of your patients');
      }
    } else if (!OFFICE_ROLES.includes(user.role) && !this.isCrossPractice(user) && ticket.createdByUserId !== user.id) {
      throw new ForbiddenException('Not your ticket');
    }
    return ticket;
  }

  async update(
    id: string,
    updates: { status?: TicketStatus; assignedToUserId?: string | null; resolutionNotes?: string },
    user: User,
  ) {
    const isProvider = user.role === UserRole.PROVIDER;
    const scoped = !isProvider && !this.isCrossPractice(user);
    const ticket = await this.ticketRepo.findOne({
      where: scoped ? { id, practiceId: user.practiceId } : { id },
      relations: isProvider ? { patient: true } : {},
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    if (isProvider) {
      const provider = await this.providerRepo.findOne({ where: { userId: user.id } });
      const ownsPatient = provider && ticket.patient?.assignedProviderId === provider.id;
      const isCreator = ticket.createdByUserId === user.id;
      if (!ownsPatient && !isCreator) {
        throw new ForbiddenException('Not one of your patients or tickets');
      }
    } else {
      const isOffice = OFFICE_ROLES.includes(user.role) || this.isCrossPractice(user);
      if (!isOffice && ticket.createdByUserId !== user.id) {
        throw new ForbiddenException('Not your ticket');
      }
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
