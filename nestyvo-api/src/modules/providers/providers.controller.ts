import { Controller, Get, Post, Put, Delete, Param, Query, Body, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { IsString, IsOptional, IsEnum, IsDateString, IsInt, Min, Max, Matches, ValidateNested, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User, UserRole } from '../../database/entities/user.entity';
import { ProvidersService } from './providers.service';
import { FillCandidatesService } from './fill-candidates.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment, AppointmentStatus, LocationType } from '../../database/entities/appointment.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { ProviderBlock, BlockType } from '../../database/entities/provider-block.entity';
import { RemindersService } from '../sms/reminders.service';

class BookAppointmentDto {
  @IsString() patientId: string;
  @IsString() startAt: string;
  @IsString() endAt: string;
  @IsOptional() @IsString() appointmentTypeId?: string;
  @IsEnum(LocationType) locationType: LocationType;
  @IsOptional() @IsString() notes?: string;
}

class LogAttemptDto {
  @IsString() patientId: string;
  @IsEnum(['call', 'sms', 'email', 'voicemail']) attemptType: string;
  @IsEnum(['reached', 'no_answer', 'voicemail', 'busy', 'wrong_number', 'scheduled', 'declined']) outcome: string;
  @IsOptional() @IsString() notes?: string;
}

class CreateBlockDto {
  @IsDateString() startAt: string;
  @IsDateString() endAt: string;
  @IsOptional() @IsEnum(BlockType) blockType?: BlockType;
  @IsOptional() @IsString() reason?: string;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

class AvailabilityWindowDto {
  @IsInt() @Min(0) @Max(6) dayOfWeek: number;
  @Matches(TIME_RE, { message: 'startTime must be HH:mm' }) startTime: string;
  @Matches(TIME_RE, { message: 'endTime must be HH:mm' }) endTime: string;
}

class ReplaceAvailabilityDto {
  @ValidateNested({ each: true })
  @Type(() => AvailabilityWindowDto)
  @ArrayMaxSize(21)
  windows: AvailabilityWindowDto[];
}

class RecurringBlockDto {
  @IsOptional() @IsEnum(['daily', 'weekly', 'monthly']) frequency?: 'daily' | 'weekly' | 'monthly';
  @IsOptional() @IsInt() @Min(0) @Max(6) dayOfWeek?: number;
  @IsOptional() @IsInt() @Min(1) @Max(31) dayOfMonth?: number;
  @Matches(TIME_RE, { message: 'startTime must be HH:mm' }) startTime: string;
  @Matches(TIME_RE, { message: 'endTime must be HH:mm' }) endTime: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsInt() @Min(1) @Max(26) weeks?: number;
  @IsOptional() @IsString() reason?: string;
}

@Controller('providers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProvidersController {
  constructor(
    private providersService: ProvidersService,
    private fillCandidatesService: FillCandidatesService,
    @InjectRepository(Appointment) private appointmentRepo: Repository<Appointment>,
    @InjectRepository(AuditLog) private auditRepo: Repository<AuditLog>,
    @InjectRepository(ProviderBlock) private blockRepo: Repository<ProviderBlock>,
    private remindersService: RemindersService,
  ) {}

  @Get()
  @Roles(UserRole.ADMINISTRATOR, UserRole.SCHEDULING_AGENT, UserRole.PRACTICE_MANAGER, UserRole.PROVIDER)
  async list(@Query('practiceId') practiceId: string | undefined, @CurrentUser() user: User) {
    const providers = await this.providersService.listForUser(user, practiceId);
    return providers.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      credentials: p.credentials,
      specialty: p.specialty,
      status: p.status,
      isVirtual: p.isVirtual,
      isInPerson: p.isInPerson,
    }));
  }

  @Get(':id/schedule')
  @Roles(UserRole.ADMINISTRATOR, UserRole.SCHEDULING_AGENT, UserRole.PRACTICE_MANAGER, UserRole.PROVIDER)
  getSchedule(@Param('id') id: string, @Query('date') date?: string) {
    return this.providersService.getSchedule(id, date);
  }

  @Get(':id/fill-candidates')
  @Roles(UserRole.ADMINISTRATOR, UserRole.SCHEDULING_AGENT, UserRole.PRACTICE_MANAGER)
  getFillCandidates(
    @Param('id') id: string,
    @Query('slotStartAt') slotStartAt: string,
    @Query('slotEndAt') slotEndAt: string,
  ) {
    return this.fillCandidatesService.getCandidates(
      id,
      new Date(slotStartAt),
      new Date(slotEndAt),
    );
  }

  @Post(':id/appointments')
  @Roles(UserRole.ADMINISTRATOR, UserRole.SCHEDULING_AGENT, UserRole.PRACTICE_MANAGER)
  async bookAppointment(
    @Param('id') providerId: string,
    @Body() dto: BookAppointmentDto,
    @CurrentUser() user: User,
  ) {
    const appt = this.appointmentRepo.create({
      providerId,
      patientId: dto.patientId,
      startAt: new Date(dto.startAt),
      endAt: new Date(dto.endAt),
      appointmentTypeId: dto.appointmentTypeId,
      locationType: dto.locationType,
      status: AppointmentStatus.SCHEDULED,
      createdBy: user.id,
    });
    const saved = await this.appointmentRepo.save(appt);
    await this.auditRepo.save(
      this.auditRepo.create({
        userId: user.id,
        action: 'appointment.create',
        resourceType: 'appointment',
        resourceId: saved.id,
        newValues: saved as any,
      }),
    );
    await this.remindersService.scheduleForAppointment(saved);
    return { id: saved.id, startAt: saved.startAt, endAt: saved.endAt };
  }

  @Post(':id/log-attempt')
  @Roles(UserRole.ADMINISTRATOR, UserRole.SCHEDULING_AGENT, UserRole.PRACTICE_MANAGER)
  async logAttempt(
    @Param('id') providerId: string,
    @Body() dto: LogAttemptDto,
    @CurrentUser() user: User,
  ) {
    await this.auditRepo.save(
      this.auditRepo.create({
        userId: user.id,
        action: `scheduling_attempt.${dto.outcome}`,
        resourceType: 'patient',
        resourceId: dto.patientId,
        newValues: { attemptType: dto.attemptType, outcome: dto.outcome, notes: dto.notes, providerId } as any,
      }),
    );
    return { success: true };
  }

  @Get(':id/availability')
  @Roles(UserRole.ADMINISTRATOR, UserRole.PRACTICE_MANAGER)
  getAvailability(@Param('id') id: string, @CurrentUser() user: User) {
    return this.providersService.getAvailability(id, user);
  }

  @Put(':id/availability')
  @Roles(UserRole.ADMINISTRATOR, UserRole.PRACTICE_MANAGER)
  replaceAvailability(
    @Param('id') id: string,
    @Body() dto: ReplaceAvailabilityDto,
    @CurrentUser() user: User,
  ) {
    return this.providersService.replaceAvailability(id, dto.windows, user);
  }

  @Get(':id/blocks')
  @Roles(UserRole.ADMINISTRATOR, UserRole.PRACTICE_MANAGER)
  getBlocksForAdmin(@Param('id') id: string, @CurrentUser() user: User) {
    return this.providersService.getBlocksForAdmin(id, user);
  }

  @Post(':id/recurring-block')
  @Roles(UserRole.ADMINISTRATOR, UserRole.PRACTICE_MANAGER)
  createRecurringBlock(
    @Param('id') id: string,
    @Body() dto: RecurringBlockDto,
    @CurrentUser() user: User,
  ) {
    return this.providersService.createRecurringBlock(
      id,
      {
        frequency: dto.frequency,
        dayOfWeek: dto.dayOfWeek,
        dayOfMonth: dto.dayOfMonth,
        startTime: dto.startTime,
        endTime: dto.endTime,
        endDate: dto.endDate,
        weeks: dto.weeks,
        reason: dto.reason,
      },
      user,
    );
  }

  @Delete(':id/blocks/:blockId')
  @Roles(UserRole.ADMINISTRATOR, UserRole.PRACTICE_MANAGER)
  deleteBlock(
    @Param('id') id: string,
    @Param('blockId') blockId: string,
    @CurrentUser() user: User,
  ) {
    return this.providersService.deleteBlock(id, blockId, user);
  }

  @Post('self/blocks')
  @Roles(UserRole.PROVIDER)
  async createBlock(
    @Body() dto: CreateBlockDto,
    @CurrentUser() user: User,
  ) {
    const provider = await this.providersService.findByUserId(user.id);
    if (!provider) throw new ForbiddenException('Not a provider account');

    const block = await this.blockRepo.save(
      this.blockRepo.create({
        providerId: provider.id,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        blockType: dto.blockType ?? BlockType.OTHER,
        reason: dto.reason,
        createdBy: user.id,
      }),
    );
    return { id: block.id, startAt: block.startAt, endAt: block.endAt };
  }

  @Get('self/calendar-feed')
  @Roles(UserRole.PROVIDER)
  async getSelfCalendarFeed(@CurrentUser() user: User, @Req() req: Request) {
    const token = await this.providersService.getOrCreateCalendarFeedToken(user);
    const origin = `${req.protocol}://${req.get('host')}`;
    const path = `/api/v1/calendar/feed/${token}.ics`;
    return { url: `${origin}${path}`, webcalUrl: `webcal://${req.get('host')}${path}` };
  }

  @Post('self/recurring-block')
  @Roles(UserRole.PROVIDER)
  createSelfRecurringBlock(@Body() dto: RecurringBlockDto, @CurrentUser() user: User) {
    return this.providersService.createSelfRecurringBlock(user, {
      frequency: dto.frequency,
      dayOfWeek: dto.dayOfWeek,
      dayOfMonth: dto.dayOfMonth,
      startTime: dto.startTime,
      endTime: dto.endTime,
      endDate: dto.endDate,
      weeks: dto.weeks,
      reason: dto.reason,
    });
  }

  @Get('self/blocks')
  @Roles(UserRole.PROVIDER)
  async getBlocks(@CurrentUser() user: User) {
    const provider = await this.providersService.findByUserId(user.id);
    if (!provider) throw new ForbiddenException('Not a provider account');

    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 86_400_000);
    const blocks = await this.blockRepo.find({
      where: { providerId: provider.id },
      order: { startAt: 'ASC' },
    });
    return blocks.filter((b) => b.endAt >= now && b.startAt <= thirtyDays);
  }
}
