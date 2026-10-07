import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards, NotFoundException } from '@nestjs/common';
import { IsOptional, IsString, IsEnum } from 'class-validator';
import { JwtAuthGuard } from '../../auth/auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ALL_STAFF, OFFICE_STAFF, ROSTER_ACCESS } from '../../auth/role-groups';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../database/entities/user.entity';
import { PreferredContact } from '../../database/entities/patient.entity';
import { PatientsService } from './patients.service';

class SetTagDto {
  @IsOptional() @IsString() tagId?: string | null;
}

class CreatePatientDto {
  @IsOptional() @IsString() practiceId?: string;
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() dob?: string;
  @IsOptional() @IsEnum(PreferredContact) preferredContact?: PreferredContact;
  @IsOptional() @IsString() assignedProviderId?: string;
  @IsOptional() @IsString() referralSource?: string;
  @IsOptional() @IsString() tagId?: string;
}

class ImportClientsDto {
  @IsOptional() @IsString() practiceId?: string;
  @IsOptional() @IsString() assignedProviderId?: string;
  @IsString() csvText: string;
}

@Controller('patients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PatientsController {
  constructor(private patientsService: PatientsService) {}

  // Charlene, Oct 6 2026 (Tax Refund 1040 pilot, item 2) — both widened
  // from OFFICE_STAFF (excludes PROVIDER) to ALL_STAFF. `create` already
  // worked for a provider's own practiceId (the caller supplies it
  // explicitly — see providers/clients/new.tsx) but the route itself
  // 403'd before ever reaching that code; `search` needed its own
  // service-layer fix too (see patients.service.ts — PROVIDER's
  // user.practiceId is always null).
  @Get()
  @Roles(...ALL_STAFF)
  search(@Query('q') query: string, @CurrentUser() user: User) {
    if (!query || query.length < 2) return [];
    return this.patientsService.search(query, user);
  }

  @Post()
  @Roles(...ALL_STAFF)
  create(@Body() dto: CreatePatientDto, @CurrentUser() user: User) {
    return this.patientsService.create(dto as any, user);
  }

  // Charlene, Oct 6 2026 (Tax Refund 1040 pilot, item 8) — admin
  // onboarding action, not something a provider does for themselves,
  // hence OFFICE_STAFF not ALL_STAFF (matches "Admin also needs a clear
  // place to import" — her wording names Admin specifically).
  @Post('import')
  @Roles(...OFFICE_STAFF)
  importClients(@Body() dto: ImportClientsDto, @CurrentUser() user: User) {
    return this.patientsService.importClients(dto as any, user);
  }

  @Get('roster')
  @Roles(...ROSTER_ACCESS)
  getRoster(@CurrentUser() user: User) {
    return this.patientsService.getRoster(user);
  }

  @Get(':id')
  @Roles(...OFFICE_STAFF)
  findOne(@Param('id') id: string) {
    return this.patientsService.findById(id);
  }

  @Get(':id/attempts')
  @Roles(...OFFICE_STAFF)
  getAttempts(@Param('id') id: string) {
    return this.patientsService.getContactAttempts(id);
  }

  @Patch(':id/tag')
  @Roles(...OFFICE_STAFF)
  setTag(@Param('id') id: string, @Body() dto: SetTagDto, @CurrentUser() user: User) {
    return this.patientsService.setTag(id, dto.tagId ?? null, user);
  }
}
