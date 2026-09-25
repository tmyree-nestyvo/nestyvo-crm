import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards, NotFoundException } from '@nestjs/common';
import { IsOptional, IsString, IsEnum } from 'class-validator';
import { JwtAuthGuard } from '../../auth/auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { OFFICE_STAFF, ROSTER_ACCESS } from '../../auth/role-groups';
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

@Controller('patients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PatientsController {
  constructor(private patientsService: PatientsService) {}

  @Get()
  @Roles(...OFFICE_STAFF)
  search(@Query('q') query: string, @CurrentUser() user: User) {
    if (!query || query.length < 2) return [];
    return this.patientsService.search(query, user);
  }

  @Post()
  @Roles(...OFFICE_STAFF)
  create(@Body() dto: CreatePatientDto, @CurrentUser() user: User) {
    return this.patientsService.create(dto as any, user);
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
