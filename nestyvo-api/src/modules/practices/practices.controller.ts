import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { IsString, IsOptional, IsEmail, IsEnum, IsDateString } from 'class-validator';
import { JwtAuthGuard } from '../../auth/auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ADMIN_AND_AGENT, ADMIN_ONLY, OFFICE_STAFF } from '../../auth/role-groups';
import { User, UserRole } from '../../database/entities/user.entity';
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

  // Widened from ADMIN_ONLY Sep 30 2026 for agent parity (Charlene: "an
  // agent should not be able to onboard a partner. They can, however,
  // adjust their business hours and block times") — an agent needs to open
  // a partner's detail screen to reach its providers, but the response is
  // trimmed to identifying info only, not the notes/subscription fields
  // that read as back-office/financial rather than "hours and block times."
  // PRACTICE_MANAGER also gains full detail here in the same pass — the
  // exact asymmetry already flagged and fixed once for the sibling GET
  // /practices (list) route on Sep 29 2026, same root cause.
  @Get(':id')
  @Roles(...OFFICE_STAFF)
  async findOne(@Param('id') id: string, @CurrentUser() user: User) {
    const practice = await this.practicesService.findOne(id);
    if (user.role === UserRole.ADMINISTRATOR || user.role === UserRole.PRACTICE_MANAGER) {
      return practice;
    }
    return {
      id: practice.id,
      name: practice.name,
      contactName: practice.contactName,
      phone: practice.phone,
      email: practice.email,
      address: practice.address,
    };
  }

  @Patch(':id')
  @Roles(...ADMIN_ONLY)
  update(@Param('id') id: string, @Body() dto: Partial<UpsertPracticeDto>) {
    return this.practicesService.update(id, dto);
  }

  // Soft delete — see PracticesService.remove for why it isn't a hard one.
  @Delete(':id')
  @Roles(...ADMIN_ONLY)
  remove(@Param('id') id: string) {
    return this.practicesService.remove(id);
  }
}
