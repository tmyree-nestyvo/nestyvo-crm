import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment } from '../../database/entities/appointment.entity';
import { AppointmentReminder, ReminderType } from '../../database/entities/appointment-reminder.entity';

const OFFSET_MS: Record<ReminderType, number> = {
  [ReminderType.NOTICE_24H]: 24 * 60 * 60 * 1000,
  [ReminderType.CANCEL_WINDOW_8H]: 8 * 60 * 60 * 1000,
  [ReminderType.DAY_OF]: 2 * 60 * 60 * 1000,
};

@Injectable()
export class RemindersService {
  constructor(@InjectRepository(AppointmentReminder) private reminderRepo: Repository<AppointmentReminder>) {}

  async scheduleForAppointment(appointment: Appointment) {
    const rows = Object.values(ReminderType).map((type) =>
      this.reminderRepo.create({
        appointmentId: appointment.id,
        type,
        scheduledFor: new Date(appointment.startAt.getTime() - OFFSET_MS[type]),
      }),
    );
    return this.reminderRepo.save(rows);
  }
}
