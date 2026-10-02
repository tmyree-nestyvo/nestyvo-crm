import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalCalendarFeed } from '../../database/entities/external-calendar-feed.entity';
import { ExternalBusyBlock } from '../../database/entities/external-busy-block.entity';
import { User } from '../../database/entities/user.entity';
import { Provider } from '../../database/entities/provider.entity';
import { ExternalCalendarsController } from './external-calendars.controller';
import { ExternalCalendarSyncService } from './external-calendar-sync.service';

@Module({
  // User is required here even though this module never queries it
  // directly — RolesGuard (applied via @UseGuards on the controller) needs
  // Repository<User> resolvable within this module's own DI container.
  // Every other module using RolesGuard (e.g. providers.module.ts) includes
  // User in its forFeature list for the same reason — missed it on the
  // first pass here and it crashed app boot ("UserRepository" not found).
  // Provider added Oct 2 2026 for the new assertCanAccess practice check.
  imports: [TypeOrmModule.forFeature([ExternalCalendarFeed, ExternalBusyBlock, User, Provider])],
  controllers: [ExternalCalendarsController],
  providers: [ExternalCalendarSyncService],
  exports: [ExternalCalendarSyncService],
})
export class ExternalCalendarsModule {}
