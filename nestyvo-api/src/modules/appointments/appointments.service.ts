import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment, AppointmentStatus } from '../../database/entities/appointment.entity';
import { FillOpportunity, FillOpportunityStatus } from '../../database/entities/fill-opportunity.entity';
import { AppointmentReminder, ReminderStatus } from '../../database/entities/appointment-reminder.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { User } from '../../database/entities/user.entity';

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectRepository(Appointment) private appointmentRepo: Repository<Appointment>,
    @InjectRepository(FillOpportunity) private fillOpRepo: Repository<FillOpportunity>,
    @InjectRepository(AppointmentReminder) private reminderRepo: Repository<AppointmentReminder>,
    @InjectRepository(AuditLog) private auditRepo: Repository<AuditLog>,
    // Deliberately NOT injecting RemindersService here — SmsModule already
    // imports AppointmentsModule (for the self-cancel route), so the
    // reverse import would be circular. Reminder scheduling for a new
    // appointment stays the caller's job (same as the original inline
    // tool-executor code already did — appointmentsService and
    // remindersService were separate injections there too), not this
    // service's.
  ) {}

  // Workstream B (Oct 3 2026) — resultStatus defaults to CANCELLED (every
  // existing caller: the public self-cancel link, the copilot's
  // cancel_appointment tool) so their behavior is unchanged. reschedule()
  // below is the only caller that passes RESCHEDULED — using the enum
  // value and AppointmentCard's purple color that already existed but were
  // dead code until now, rather than inventing a new status.
  async cancel(
    appointmentId: string,
    options: { reason?: string; user: User | null; action?: string; resultStatus?: AppointmentStatus },
  ) {
    const appt = await this.appointmentRepo.findOne({ where: { id: appointmentId } });
    if (!appt) return { error: 'Appointment not found' };

    const old = { ...appt };
    appt.status = options.resultStatus ?? AppointmentStatus.CANCELLED;
    appt.cancelledAt = new Date();
    appt.cancellationReason = options.reason ?? null;
    await this.appointmentRepo.save(appt);

    // The released time becomes a real fill opportunity either way — a
    // rescheduled-away slot is just as open to Fill/Smart Fill as a
    // cancelled one (Charlene: "make the opening available to Fill/Smart
    // Fill" — same principle applies to either release reason).
    const fill = this.fillOpRepo.create({
      sourceAppointmentId: appt.id,
      providerId: appt.providerId,
      slotStartAt: appt.startAt,
      slotEndAt: appt.endAt,
      appointmentTypeId: appt.appointmentTypeId,
      status: FillOpportunityStatus.OPEN,
    });
    await this.fillOpRepo.save(fill);

    await this.reminderRepo.update(
      { appointmentId: appt.id, status: ReminderStatus.PENDING },
      { status: ReminderStatus.CANCELLED },
    );

    await this.audit(options.action || 'appointment.cancel', appt.id, old, appt, options.user);
    return { success: true, fillOpportunityId: fill.id, appointment: appt };
  }

  // Workstream B (Oct 3 2026) — Charlene: "I do not want normal scheduling
  // actions maintained separately in the copilot path." This is a direct
  // extraction of what agent-tool-executor.service.ts's rescheduleAppointment
  // already did inline; the tool executor now calls this instead of
  // duplicating it, and the new staff-facing REST route (providers.controller
  // .ts) calls the exact same method — one reschedule implementation, two
  // entry points, matching her "one scheduling service" rule.
  async reschedule(
    appointmentId: string,
    options: { newStartAt: Date; newEndAt?: Date; reason?: string; user: User },
  ) {
    const appt = await this.appointmentRepo.findOne({ where: { id: appointmentId } });
    if (!appt) throw new NotFoundException('Appointment not found');

    // Preserve the original duration when no explicit new end time is
    // given (the copilot's simpler tool input only ever sends a new start
    // time) — the REST path can pass an explicit newEndAt to let the agent
    // adjust duration at the same time as the slot.
    const durationMs = appt.endAt.getTime() - appt.startAt.getTime();
    const newEndAt = options.newEndAt ?? new Date(options.newStartAt.getTime() + durationMs);

    await this.cancel(appt.id, {
      reason: options.reason || 'Rescheduled',
      user: options.user,
      action: 'appointment.reschedule_old',
      resultStatus: AppointmentStatus.RESCHEDULED,
    });

    const newAppt = this.appointmentRepo.create({
      providerId: appt.providerId,
      patientId: appt.patientId,
      appointmentTypeId: appt.appointmentTypeId,
      startAt: options.newStartAt,
      endAt: newEndAt,
      locationType: appt.locationType,
      rescheduledFromId: appt.id,
      createdBy: options.user.id,
    });
    const saved = await this.appointmentRepo.save(newAppt);
    await this.audit('appointment.reschedule', saved.id, null, saved, options.user);
    // Reminder scheduling is the caller's responsibility — see the
    // constructor comment on why RemindersService isn't injected here.
    return saved;
  }

  private async audit(action: string, resourceId: string, oldValues: any, newValues: any, user: User | null) {
    const log = this.auditRepo.create({
      userId: user?.id ?? null,
      action,
      resourceType: 'appointment',
      resourceId,
      oldValues,
      newValues,
    });
    await this.auditRepo.save(log);
  }
}
