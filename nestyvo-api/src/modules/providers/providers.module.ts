import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Provider } from '../../database/entities/provider.entity';
import { Appointment } from '../../database/entities/appointment.entity';
import { AgentProviderAssignment } from '../../database/entities/agent-provider-assignment.entity';
import { WaitlistEntry } from '../../database/entities/waitlist-entry.entity';
import { Patient } from '../../database/entities/patient.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { ProviderBlock } from '../../database/entities/provider-block.entity';
import { User } from '../../database/entities/user.entity';
import { ProvidersService } from './providers.service';
import { FillCandidatesService } from './fill-candidates.service';
import { ProvidersController } from './providers.controller';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Provider, Appointment, AgentProviderAssignment,
      WaitlistEntry, Patient, AuditLog, ProviderBlock, User,
    ]),
    SmsModule,
  ],
  providers: [ProvidersService, FillCandidatesService],
  controllers: [ProvidersController],
  exports: [ProvidersService, FillCandidatesService],
})
export class ProvidersModule {}
