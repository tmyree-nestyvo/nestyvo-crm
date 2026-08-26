import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards } from '@nestjs/common';
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { JwtAuthGuard } from '../../auth/auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User, UserRole } from '../../database/entities/user.entity';
import { TicketCategory, TicketPriority, TicketStatus } from '../../database/entities/ticket.entity';
import { TicketsService } from './tickets.service';

class CreateTicketDto {
  @IsOptional() @IsString() patientId?: string;
  @IsEnum(TicketCategory) category: TicketCategory;
  @IsOptional() @IsEnum(TicketPriority) priority?: TicketPriority;
  @IsString() subject: string;
  @IsString() description: string;
}

class UpdateTicketDto {
  @IsOptional() @IsEnum(TicketStatus) status?: TicketStatus;
  @IsOptional() @IsString() assignedToUserId?: string | null;
  @IsOptional() @IsString() resolutionNotes?: string;
}

@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMINISTRATOR, UserRole.SCHEDULING_AGENT, UserRole.PRACTICE_MANAGER)
export class TicketsController {
  constructor(private ticketsService: TicketsService) {}

  @Post()
  create(@Body() dto: CreateTicketDto, @CurrentUser() user: User) {
    return this.ticketsService.create(dto, user);
  }

  @Get()
  @Roles(UserRole.ADMINISTRATOR, UserRole.SCHEDULING_AGENT, UserRole.PRACTICE_MANAGER, UserRole.PROVIDER)
  list(
    @Query('status') status: TicketStatus | undefined,
    @Query('patientId') patientId: string | undefined,
    @CurrentUser() user: User,
  ) {
    return this.ticketsService.list(status, patientId, user);
  }

  @Get(':id')
  @Roles(UserRole.ADMINISTRATOR, UserRole.SCHEDULING_AGENT, UserRole.PRACTICE_MANAGER, UserRole.PROVIDER)
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.ticketsService.findOne(id, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTicketDto, @CurrentUser() user: User) {
    return this.ticketsService.update(id, dto, user);
  }
}
