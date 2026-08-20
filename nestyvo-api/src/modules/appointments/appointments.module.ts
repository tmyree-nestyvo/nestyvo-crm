import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppointmentsService } from './appointments.service';
import { Appointment } from '../../database/entities/appointment.entity';
import { FillOpportunity } from '../../database/entities/fill-opportunity.entity';
import { AppointmentReminder } from '../../database/entities/appointment-reminder.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Appointment, FillOpportunity, AppointmentReminder, AuditLog])],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
