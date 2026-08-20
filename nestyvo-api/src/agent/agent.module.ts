import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';
import { AgentToolExecutorService } from './agent-tool-executor.service';
import { Patient } from '../database/entities/patient.entity';
import { Appointment } from '../database/entities/appointment.entity';
import { WaitlistEntry } from '../database/entities/waitlist-entry.entity';
import { ProviderAvailability } from '../database/entities/provider-availability.entity';
import { ProviderBlock } from '../database/entities/provider-block.entity';
import { AuditLog } from '../database/entities/audit-log.entity';
import { User } from '../database/entities/user.entity';
import { AppointmentsModule } from '../modules/appointments/appointments.module';
import { SmsModule } from '../modules/sms/sms.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Patient, Appointment, WaitlistEntry, ProviderAvailability, ProviderBlock, AuditLog, User]),
    AppointmentsModule,
    SmsModule,
  ],
  providers: [AgentService, AgentToolExecutorService],
  controllers: [AgentController],
})
export class AgentModule {}
