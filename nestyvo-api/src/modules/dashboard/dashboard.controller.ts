import { Controller, Get, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User, UserRole } from '../../database/entities/user.entity';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('agent')
  @Roles(UserRole.ADMINISTRATOR, UserRole.SCHEDULING_AGENT, UserRole.PRACTICE_MANAGER)
  getAgentDashboard(@CurrentUser() user: User) {
    return this.dashboardService.getAgentDashboard(user);
  }

  @Get('provider')
  @Roles(UserRole.PROVIDER)
  getProviderDashboard(@CurrentUser() user: User) {
    return this.dashboardService.getProviderDashboard(user);
  }

  @Get('provider/cancellations')
  @Roles(UserRole.PROVIDER)
  getProviderCancellations(@CurrentUser() user: User) {
    return this.dashboardService.getProviderCancellations(user);
  }

  @Get('agent/callbacks')
  @Roles(UserRole.ADMINISTRATOR, UserRole.SCHEDULING_AGENT, UserRole.PRACTICE_MANAGER)
  getAgentCallbacks(@CurrentUser() user: User) {
    return this.dashboardService.getAgentCallbacks(user);
  }

  @Patch('agent/callbacks/:id/dismiss')
  @Roles(UserRole.ADMINISTRATOR, UserRole.SCHEDULING_AGENT, UserRole.PRACTICE_MANAGER)
  dismissCallback(@CurrentUser() user: User, @Param('id') id: string) {
    return this.dashboardService.dismissCallback(user, id);
  }

  @Get('agent/cancellations')
  @Roles(UserRole.ADMINISTRATOR, UserRole.SCHEDULING_AGENT, UserRole.PRACTICE_MANAGER)
  getAgentCancellations(@CurrentUser() user: User) {
    return this.dashboardService.getAgentCancellations(user);
  }

  @Get('agent/waitlist')
  @Roles(UserRole.ADMINISTRATOR, UserRole.SCHEDULING_AGENT, UserRole.PRACTICE_MANAGER)
  getAgentWaitlist(@CurrentUser() user: User) {
    return this.dashboardService.getAgentWaitlist(user);
  }

  @Get('agent/stats')
  @Roles(UserRole.ADMINISTRATOR, UserRole.SCHEDULING_AGENT, UserRole.PRACTICE_MANAGER)
  getAgentStats(@CurrentUser() user: User, @Query('period') period = 'month') {
    return this.dashboardService.getAgentStats(user, period);
  }
}
