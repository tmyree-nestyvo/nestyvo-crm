import { Controller, Get, Post, Param, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Public } from '../../auth/decorators/public.decorator';
import { AppointmentReminder, ReminderStatus, ReminderType } from '../../database/entities/appointment-reminder.entity';
import { Appointment, AppointmentStatus } from '../../database/entities/appointment.entity';
import { AppointmentsService } from '../appointments/appointments.service';

@Controller('reminders')
export class RemindersController {
  constructor(
    @InjectRepository(AppointmentReminder) private reminderRepo: Repository<AppointmentReminder>,
    private appointmentsService: AppointmentsService,
  ) {}

  @Public()
  @Get(':id')
  async get(@Param('id') id: string) {
    const reminder = await this.reminderRepo.findOne({
      where: { id },
      relations: { appointment: { provider: true } },
    });
    if (!reminder) throw new NotFoundException('Reminder not found');
    const appt = reminder.appointment;
    return {
      provider: `${appt.provider.firstName} ${appt.provider.lastName}`,
      startAt: appt.startAt,
      status: appt.status,
      canCancel: this.canCancel(reminder, appt),
    };
  }

  @Public()
  @Post(':id/cancel')
  async cancel(@Param('id') id: string) {
    const reminder = await this.reminderRepo.findOne({ where: { id }, relations: { appointment: true } });
    if (!reminder) throw new NotFoundException('Reminder not found');
    if (!this.canCancel(reminder, reminder.appointment)) {
      throw new ConflictException('This link is no longer valid');
    }

    const result = await this.appointmentsService.cancel(reminder.appointmentId, {
      reason: 'Patient self-service cancellation',
      user: null,
      action: 'appointment.self_cancel',
    });

    reminder.cancelledViaLinkAt = new Date();
    await this.reminderRepo.save(reminder);
    return result;
  }

  private canCancel(reminder: AppointmentReminder, appt: Appointment | null) {
    return (
      reminder.type === ReminderType.CANCEL_WINDOW_8H &&
      reminder.status === ReminderStatus.SENT &&
      !reminder.cancelledViaLinkAt &&
      !!reminder.cancelWindowExpiresAt &&
      new Date() < reminder.cancelWindowExpiresAt &&
      appt?.status === AppointmentStatus.SCHEDULED
    );
  }
}
