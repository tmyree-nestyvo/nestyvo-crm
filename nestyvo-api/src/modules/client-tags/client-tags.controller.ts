import { Controller, Get, Post, Patch, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
import { IsString, IsInt, IsOptional, IsBoolean, Min } from 'class-validator';
import { JwtAuthGuard } from '../../auth/auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ALL_STAFF, OFFICE_STAFF, PRACTICE_MANAGEMENT } from '../../auth/role-groups';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../database/entities/user.entity';
import { ClientTagsService } from './client-tags.service';

class CreateTagDto {
  @IsString() name: string;
  @IsInt() @Min(1) blockMinutes: number;
  // Charlene, Oct 5 2026 — required for ADMINISTRATOR/SCHEDULING_AGENT
  // (cross-practice, no fixed practiceId of their own); ignored for
  // PRACTICE_MANAGER, who always writes to their own practice.
  @IsOptional() @IsString() practiceId?: string;
}

class UpdateTagDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() @Min(1) blockMinutes?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() practiceId?: string;
}

@Controller('client-tags')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientTagsController {
  constructor(private tagsService: ClientTagsService) {}

  // Charlene, Oct 6 2026 (Tax Refund 1040 pilot, item 7) — widened to
  // ALL_STAFF (was OFFICE_STAFF, excluding PROVIDER). Write routes below
  // stay OFFICE_STAFF-only — tag *definitions* stay staff-configured per
  // item 12 ("providers select from configured tags, don't need
  // permission to create new ones").
  @Get()
  @Roles(...ALL_STAFF)
  list(@Query('practiceId') practiceId: string | undefined, @CurrentUser() user: User) {
    return this.tagsService.list(user, practiceId);
  }

  // Charlene, Oct 5 2026 — "Admin AND Agent users must be able to create
  // new custom client tag names" — widened from PRACTICE_MANAGEMENT to
  // OFFICE_STAFF (same as list() already is), with the practiceId
  // resolution fix in the service above so an agent's write actually
  // lands somewhere visible instead of silently orphaning.
  @Post()
  @Roles(...OFFICE_STAFF)
  create(@Body() dto: CreateTagDto, @CurrentUser() user: User) {
    return this.tagsService.create(dto.name, dto.blockMinutes, user, dto.practiceId);
  }

  @Patch(':id')
  @Roles(...OFFICE_STAFF)
  update(@Param('id') id: string, @Body() dto: UpdateTagDto, @CurrentUser() user: User) {
    return this.tagsService.update(id, dto, user, dto.practiceId);
  }

  @Delete(':id')
  @Roles(...OFFICE_STAFF)
  remove(@Param('id') id: string, @Query('practiceId') practiceId: string | undefined, @CurrentUser() user: User) {
    return this.tagsService.remove(id, user, practiceId);
  }
}
