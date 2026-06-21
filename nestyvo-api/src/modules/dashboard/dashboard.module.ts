import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from '../../database/entities/appointment.entity';
import { Provider } from '../../database/entities/provider.entity';
import { FillOpportunity } from '../../database/entities/fill-opportunity.entity';
import { WaitlistEntry } from '../../database/entities/waitlist-entry.entity';
import { CallbackRequest } from '../../database/entities/callback-request.entity';
import { AgentProviderAssignment } from '../../database/entities/agent-provider-assignment.entity';
import { ProviderAvailability } from '../../database/entities/provider-availability.entity';
import { ProviderBlock } from '../../database/entities/provider-block.entity';
import { User } from '../../database/entities/user.entity';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Appointment,
      Provider,
      FillOpportunity,
      WaitlistEntry,
      CallbackRequest,
      AgentProviderAssignment,
      ProviderAvailability,
      ProviderBlock,
      User,
    ]),
  ],
  providers: [DashboardService],
  controllers: [DashboardController],
})
export class DashboardModule {}
