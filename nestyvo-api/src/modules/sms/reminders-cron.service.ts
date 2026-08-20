import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { AppointmentReminder, ReminderStatus, ReminderType } from '../../database/entities/appointment-reminder.entity';
import { AppointmentStatus } from '../../database/entities/appointment.entity';
import { SmsService } from './sms.service';

const CANCEL_WINDOW_MS = 30 * 60 * 1000;

@Injectable()
export class RemindersCronService {
  private readonly logger = new Logger(RemindersCronService.name);

  constructor(
    @InjectRepository(AppointmentReminder) private reminderRepo: Repository<AppointmentReminder>,
    private smsService: SmsService,
  ) {}

  @Cron('*/5 * * * *')
  async processDueReminders() {
    const due = await this.reminderRepo.find({
      where: { status: ReminderStatus.PENDING, scheduledFor: LessThanOrEqual(new Date()) },
      relations: { appointment: { patient: true, provider: { practice: true } } },
      take: 200,
    });

    for (const reminder of due) {
      try {
        await this.processOne(reminder);
      } catch (err: any) {
        reminder.status = ReminderStatus.FAILED;
        reminder.failureReason = err?.message ?? 'Unknown error';
        await this.reminderRepo.save(reminder);
        this.logger.error(`Failed to process reminder ${reminder.id}: ${err?.message}`);
      }
    }
  }

  private async processOne(reminder: AppointmentReminder) {
    const appt = reminder.appointment;
    if (!appt || appt.status !== AppointmentStatus.SCHEDULED) {
      reminder.status = ReminderStatus.CANCELLED;
      await this.reminderRepo.save(reminder);
      return;
    }
    if (appt.provider?.practice?.remindersEnabled === false) {
      reminder.status = ReminderStatus.CANCELLED;
      await this.reminderRepo.save(reminder);
      return;
    }

    const to = appt.patient.phone || appt.patient.email;
    const now = new Date();
    if (reminder.type === ReminderType.CANCEL_WINDOW_8H) {
      reminder.cancelWindowExpiresAt = new Date(now.getTime() + CANCEL_WINDOW_MS);
    }

    const cancelLink =
      reminder.type === ReminderType.CANCEL_WINDOW_8H
        ? ` Cancel within 30 min: ${process.env.APP_URL || ''}/cancel/${reminder.id}`
        : '';

    await this.smsService.send({
      to,
      body: this.messageFor(reminder.type, appt.startAt) + cancelLink,
      channel: reminder.channel,
      appointmentId: appt.id,
      reminderId: reminder.id,
      reminderType: reminder.type,
    });

    reminder.status = ReminderStatus.SENT;
    reminder.sentAt = now;
    await this.reminderRepo.save(reminder);
  }

  private messageFor(type: ReminderType, startAt: Date) {
    const when = new Date(startAt).toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    if (type === ReminderType.NOTICE_24H) return `Reminder: you have an appointment on ${when}.`;
    if (type === ReminderType.CANCEL_WINDOW_8H) return `Your appointment is coming up on ${when}.`;
    return `See you soon — your appointment is on ${when}.`;
  }
}
