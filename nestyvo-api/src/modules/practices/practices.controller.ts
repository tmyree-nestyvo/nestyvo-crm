import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { IsString, IsOptional, IsEmail, IsEnum, IsDateString } from 'class-validator';
import { JwtAuthGuard } from '../../auth/auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ADMIN_AND_AGENT, ADMIN_ONLY } from '../../auth/role-groups';
import { UserRole } from '../../database/entities/user.entity';
import { SubscriptionStatus } from '../../database/entities/practice.entity';
import { PracticesService } from './practices.service';

class UpsertPracticeDto {
  @IsString() name: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsEnum(SubscriptionStatus) subscriptionStatus?: SubscriptionStatus;
  @IsOptional() @IsDateString() subscriptionExpiresAt?: string;
}

@Controller('practices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PracticesController {
  constructor(private practicesService: PracticesService) {}

  @Get()
  // Sep 24 role-groups.ts flagged this as "likely an oversight" —
  // PRACTICE_MANAGER was left out of the only consumer of ADMIN_AND_AGENT.
  // Confirmed real Sep 29 2026 during an RBAC parity audit: a
  // practice_manager can already reach Provider Settings (gated to
  // PRACTICE_MANAGEMENT), whose very first call is this endpoint, so they
  // hit a 403 and an empty Partner picker on a screen they're otherwise
  // allowed into. list() only ever returns {id, name} (see
  // PracticesService.list) — no business/subscription detail, that's
  // listAdmin() below, still admin-only — so widening this is low-risk.
  @Roles(...ADMIN_AND_AGENT, UserRole.PRACTICE_MANAGER)
  list() {
    return this.practicesService.list();
  }

  // Literal route — must stay declared before GET :id below, or it gets
  // swallowed by that param route (id="admin"). See providers.controller.ts
  // for the exact bug this pattern caused there.
  @Get('admin')
  @Roles(...ADMIN_ONLY)
  listAdmin() {
    return this.practicesService.listAdmin();
  }

  @Post()
  @Roles(...ADMIN_ONLY)
  create(@Body() dto: UpsertPracticeDto) {
    return this.practicesService.create(dto);
  }

  @Get(':id')
  @Roles(...ADMIN_ONLY)
  findOne(@Param('id') id: string) {
    return this.practicesService.findOne(id);
  }

  @Patch(':id')
  @Roles(...ADMIN_ONLY)
  update(@Param('id') id: string, @Body() dto: Partial<UpsertPracticeDto>) {
    return this.practicesService.update(id, dto);
  }
}
