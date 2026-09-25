import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards } from '@nestjs/common';
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { JwtAuthGuard } from '../../auth/auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { OFFICE_STAFF, PROVIDER_ONLY } from '../../auth/role-groups';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../database/entities/user.entity';
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
  @Roles(...OFFICE_STAFF)
  getAgentDashboard(@CurrentUser() user: User, @Query('days') days?: string) {
    return this.dashboardService.getAgentDashboard(user, days ? parseInt(days, 10) : 30);
  }

  @Get('provider')
  @Roles(...PROVIDER_ONLY)
  getProviderDashboard(@CurrentUser() user: User) {
    return this.dashboardService.getProviderDashboard(user);
  }

  @Get('provider/available-slots')
  @Roles(...PROVIDER_ONLY)
  getProviderAvailableSlots(@CurrentUser() user: User, @Query('days') days?: string) {
    return this.dashboardService.getProviderAvailableSlots(user, days ? parseInt(days, 10) : 30);
  }

  @Get('provider/cancellations')
  @Roles(...PROVIDER_ONLY)
  getProviderCancellations(@CurrentUser() user: User) {
    return this.dashboardService.getProviderCancellations(user);
  }

  @Get('agent/callbacks')
  @Roles(...OFFICE_STAFF)
  getAgentCallbacks(@CurrentUser() user: User) {
    return this.dashboardService.getAgentCallbacks(user);
  }

  @Post('agent/callbacks')
  @Roles(...OFFICE_STAFF)
  createCallback(@CurrentUser() user: User, @Body() dto: CreateCallbackDto) {
    return this.dashboardService.createCallback(user, dto);
  }

  @Patch('agent/callbacks/:id/dismiss')
  @Roles(...OFFICE_STAFF)
  dismissCallback(@CurrentUser() user: User, @Param('id') id: string) {
    return this.dashboardService.dismissCallback(user, id);
  }

  @Get('agent/cancellations')
  @Roles(...OFFICE_STAFF)
  getAgentCancellations(@CurrentUser() user: User) {
    return this.dashboardService.getAgentCancellations(user);
  }

  @Get('agent/waitlist')
  @Roles(...OFFICE_STAFF)
  getAgentWaitlist(@CurrentUser() user: User) {
    return this.dashboardService.getAgentWaitlist(user);
  }

  @Get('agent/stats')
  @Roles(...OFFICE_STAFF)
  getAgentStats(@CurrentUser() user: User, @Query('period') period = 'month') {
    return this.dashboardService.getAgentStats(user, period);
  }
}
