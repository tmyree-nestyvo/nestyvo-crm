import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards } from '@nestjs/common';
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { JwtAuthGuard } from '../../auth/auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User, UserRole } from '../../database/entities/user.entity';
import { CallbackSource } from '../../database/entities/callback-request.entity';
import { DashboardService } from './dashboard.service';

class CreateCallbackDto {
  @IsString() patientId: string;
  @IsEnum(CallbackSource) source: CallbackSource;
  @IsOptional() @IsString() notes?: string;
}

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('agent')
  @Roles(UserRole.ADMINISTRATOR, UserRole.SCHEDULING_AGENT, UserRole.PRACTICE_MANAGER)
  getAgentDashboard(@CurrentUser() user: User, @Query('days') days?: string) {
    return this.dashboardService.getAgentDashboard(user, days ? parseInt(days, 10) : 30);
  }

  @Get('provider')
  @Roles(UserRole.PROVIDER)
  getProviderDashboard(@CurrentUser() user: User) {
    return this.dashboardService.getProviderDashboard(user);
  }

  @Get('provider/available-slots')
  @Roles(UserRole.PROVIDER)
  getProviderAvailableSlots(@CurrentUser() user: User, @Query('days') days?: string) {
    return this.dashboardService.getProviderAvailableSlots(user, days ? parseInt(days, 10) : 30);
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

  @Post('agent/callbacks')
  @Roles(UserRole.ADMINISTRATOR, UserRole.SCHEDULING_AGENT, UserRole.PRACTICE_MANAGER)
  createCallback(@CurrentUser() user: User, @Body() dto: CreateCallbackDto) {
    return this.dashboardService.createCallback(user, dto);
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
