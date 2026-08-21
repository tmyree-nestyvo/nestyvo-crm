import { Controller, Get, Post, Patch, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
import { IsString, IsInt, IsOptional, IsBoolean, Min } from 'class-validator';
import { JwtAuthGuard } from '../../auth/auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User, UserRole } from '../../database/entities/user.entity';
import { ClientTagsService } from './client-tags.service';

class CreateTagDto {
  @IsString() name: string;
  @IsInt() @Min(1) blockMinutes: number;
}

class UpdateTagDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() @Min(1) blockMinutes?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Controller('client-tags')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientTagsController {
  constructor(private tagsService: ClientTagsService) {}

  @Get()
  @Roles(UserRole.ADMINISTRATOR, UserRole.SCHEDULING_AGENT, UserRole.PRACTICE_MANAGER)
  list(@Query('practiceId') practiceId: string | undefined, @CurrentUser() user: User) {
    return this.tagsService.list(user, practiceId);
  }

  @Post()
  @Roles(UserRole.ADMINISTRATOR, UserRole.PRACTICE_MANAGER)
  create(@Body() dto: CreateTagDto, @CurrentUser() user: User) {
    return this.tagsService.create(dto.name, dto.blockMinutes, user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMINISTRATOR, UserRole.PRACTICE_MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateTagDto, @CurrentUser() user: User) {
    return this.tagsService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.ADMINISTRATOR, UserRole.PRACTICE_MANAGER)
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.tagsService.remove(id, user);
  }
}
