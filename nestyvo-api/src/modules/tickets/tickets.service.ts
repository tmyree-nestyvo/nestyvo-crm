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

const STATUS_ACTION: Record<string, string> = {
  open: 'Reopened this request',
  in_progress: 'Marked In Progress',
  resolved: 'Marked Resolved',
  closed: 'Closed this request',
};

/**
 * History entries are stored as "[Oct 10, 7:45 AM] Name: text" blocks in
 * resolutionNotes (see update()). Adds two derived fields, no schema change:
 *  - lastEntry: the most recent entry, for list previews (Oct 10 recording
 *    43:28 — "not very clear what the status is until we click on it").
 *  - awaitingOffice: true when the last word came from the requester (or
 *    nobody has responded yet) — drives the admin Requests counter
 *    (41:48 — "there should definitely be like a notification counter").
 */
function withActivity<T extends Ticket>(ticket: T) {
  const blocks = (ticket.resolutionNotes ?? '').split(/\n\n(?=\[)/).filter(Boolean);
  const last = blocks[blocks.length - 1];
  const m = last?.match(/^\[([^\]]+)\] ([^:]+): ([\s\S]*)$/);
  const lastEntry = m ? { at: m[1], author: m[2], text: m[3] } : null;
  const creatorName = ticket.createdByUser
    ? `${ticket.createdByUser.firstName} ${ticket.createdByUser.lastName}`.trim()
    : null;
  const active = ticket.status !== TicketStatus.RESOLVED && ticket.status !== TicketStatus.CLOSED;
  // Only provider-raised requests wait on the office; office-created tickets don't count.
  const fromProvider = ticket.createdByUser?.role === UserRole.PROVIDER;
  const awaitingOffice = active && fromProvider && (!lastEntry || lastEntry.author === creatorName);
  return Object.assign(ticket, { lastEntry, awaitingOffice });
}

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
      // Their clients' tickets, plus any request they created themselves —
      // a request sent without picking a client used to vanish from their
      // own Requests list entirely.
      const tickets = await this.ticketRepo.find({
        where: [
          { ...where, patient: { assignedProviderId: provider.id } },
          { ...where, createdByUserId: user.id },
        ],
        relations: { patient: true, createdByUser: true, assignedToUser: true },
        order: { createdAt: 'DESC' },
      });
      return tickets.map(withActivity);
    } else if (!this.isCrossPractice(user)) {
      where.practiceId = user.practiceId;
      if (!isOffice) where.createdByUserId = user.id;
    }
    // else: admin/scheduling_agent — no practiceId filter at all, every
    // practice's tickets (isOffice is also always true for ADMINISTRATOR,
    // and SCHEDULING_AGENT already saw every ticket within one practice —
    // this just removes the practice boundary itself).

    const tickets = await this.ticketRepo.find({
      where,
      relations: { patient: true, createdByUser: true, assignedToUser: true },
      order: { createdAt: 'DESC' },
    });
    return tickets.map(withActivity);
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
      const ownsPatient = provider && ticket.patient?.assignedProviderId === provider.id;
      if (!ownsPatient && ticket.createdByUserId !== user.id) {
        throw new ForbiddenException('Not one of your patients');
      }
    } else if (!OFFICE_ROLES.includes(user.role) && !this.isCrossPractice(user) && ticket.createdByUserId !== user.id) {
      throw new ForbiddenException('Not your ticket');
    }
    return withActivity(ticket);
  }

  async update(
    id: string,
    updates: {
      status?: TicketStatus;
      assignedToUserId?: string | null;
      resolutionNotes?: string;
      replyText?: string;
    },
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

    const authorName = `${user.firstName} ${user.lastName}`.trim() || 'Unknown';
    const stamp = () => new Date().toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles',
    });
    const append = (text: string) => {
      const entry = `[${stamp()}] ${authorName}: ${text}`;
      ticket.resolutionNotes = ticket.resolutionNotes ? `${ticket.resolutionNotes}\n\n${entry}` : entry;
    };

    // Reply first, then the status change, so "Called back and left a
    // message" reads before "Marked In Progress" in the history.
    if (updates.replyText !== undefined && updates.replyText.trim()) {
      append(updates.replyText.trim());
    }
    if (updates.status !== undefined && updates.status !== ticket.status) {
      // Charlene, Oct 10 recording (45:16) — "she doesn't see a clear outcome
      // that it's resolved… clear to each party… the action that is being
      // taken." Status changes used to happen silently; now each one is a
      // line in the history with who did it and when.
      append(`${STATUS_ACTION[updates.status] ?? `Changed status to ${updates.status}`}`);
      ticket.status = updates.status;
      if (updates.status === TicketStatus.RESOLVED || updates.status === TicketStatus.CLOSED) {
        ticket.resolvedAt = new Date();
      }
    }
    if (updates.assignedToUserId !== undefined) ticket.assignedToUserId = updates.assignedToUserId;
    // Direct overwrite — kept for any caller that genuinely wants it, but
    // neither tickets screen uses this anymore (see replyText below).
    if (updates.resolutionNotes !== undefined) ticket.resolutionNotes = updates.resolutionNotes;

    await this.ticketRepo.save(ticket);
    // Full ticket back (relations + activity) so both screens can show the
    // new history immediately instead of waiting for a manual refresh
    // (Oct 10 recording 44:00, "when I hit reply, it does not update").
    const fresh = await this.ticketRepo.findOne({
      where: { id: ticket.id },
      relations: { patient: true, createdByUser: true, assignedToUser: true },
    });
    return withActivity(fresh!);
  }
}
