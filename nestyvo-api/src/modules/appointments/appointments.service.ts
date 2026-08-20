import { Injectable } from '@nestjs/common';
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
  ) {}

  async cancel(appointmentId: string, options: { reason?: string; user: User | null; action?: string }) {
    const appt = await this.appointmentRepo.findOne({ where: { id: appointmentId } });
    if (!appt) return { error: 'Appointment not found' };

    const old = { ...appt };
    appt.status = AppointmentStatus.CANCELLED;
    appt.cancelledAt = new Date();
    appt.cancellationReason = options.reason ?? null;
    await this.appointmentRepo.save(appt);

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
    return { success: true, fillOpportunityId: fill.id };
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
