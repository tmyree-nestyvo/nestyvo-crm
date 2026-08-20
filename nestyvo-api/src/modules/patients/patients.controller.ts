import { Controller, Get, Patch, Param, Query, Body, UseGuards, NotFoundException } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../../auth/auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User, UserRole } from '../../database/entities/user.entity';
import { PatientsService } from './patients.service';

class SetTagDto {
  @IsOptional() @IsString() tagId?: string | null;
}

@Controller('patients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PatientsController {
  constructor(private patientsService: PatientsService) {}

  @Get()
  @Roles(UserRole.ADMINISTRATOR, UserRole.SCHEDULING_AGENT, UserRole.PRACTICE_MANAGER)
  search(@Query('q') query: string, @CurrentUser() user: User) {
    if (!query || query.length < 2) return [];
    return this.patientsService.search(query, user);
  }

  @Get('roster')
  @Roles(UserRole.ADMINISTRATOR, UserRole.PROVIDER, UserRole.PRACTICE_MANAGER)
  getRoster(@CurrentUser() user: User) {
    return this.patientsService.getRoster(user);
  }

  @Get(':id')
  @Roles(UserRole.ADMINISTRATOR, UserRole.SCHEDULING_AGENT, UserRole.PRACTICE_MANAGER)
  findOne(@Param('id') id: string) {
    return this.patientsService.findById(id);
  }

  @Get(':id/attempts')
  @Roles(UserRole.ADMINISTRATOR, UserRole.SCHEDULING_AGENT, UserRole.PRACTICE_MANAGER)
  getAttempts(@Param('id') id: string) {
    return this.patientsService.getContactAttempts(id);
  }

  @Patch(':id/tag')
  @Roles(UserRole.ADMINISTRATOR, UserRole.SCHEDULING_AGENT, UserRole.PRACTICE_MANAGER)
  setTag(@Param('id') id: string, @Body() dto: SetTagDto, @CurrentUser() user: User) {
    return this.patientsService.setTag(id, dto.tagId ?? null, user);
  }
}
