import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SmsService } from './sms.service';
import { RemindersService } from './reminders.service';
import { RemindersCronService } from './reminders-cron.service';
import { RemindersController } from './reminders.controller';
import { AppointmentReminder } from '../../database/entities/appointment-reminder.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { AppointmentsModule } from '../appointments/appointments.module';

@Module({
  imports: [TypeOrmModule.forFeature([AppointmentReminder, AuditLog]), AppointmentsModule],
  providers: [SmsService, RemindersService, RemindersCronService],
  controllers: [RemindersController],
  exports: [RemindersService],
})
export class SmsModule {}
