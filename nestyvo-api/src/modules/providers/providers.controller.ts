import { Controller, Get, Post, Put, Patch, Delete, Param, Query, Body, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { IsString, IsOptional, IsEnum, IsDateString, IsInt, Min, Max, Matches, ValidateNested, ArrayMaxSize, IsArray, ArrayMinSize, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ADMIN_ONLY, ALL_STAFF, OFFICE_STAFF, PRACTICE_MANAGEMENT, PROVIDER_ONLY } from '../../auth/role-groups';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../database/entities/user.entity';
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

class CreateProviderDto {
  @IsString() practiceId: string;
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsOptional() @IsString() credentials?: string;
  @IsOptional() @IsString() specialty?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() officeLocation?: string;
  @IsOptional() isVirtual?: boolean;
  @IsOptional() isInPerson?: boolean;
  // If set, also creates their PROVIDER-role login (see UsersService.create).
  @IsOptional() @IsString() loginEmail?: string;
  // Optional — admin can set it directly; otherwise a temp password is
  // generated and returned once in the response (see UsersService.create).
  @IsOptional() @IsString() @MinLength(8) loginPassword?: string;
  @IsOptional() @IsInt() @Min(15) defaultSlotDurationMin?: number;
}

// Everything optional — the common edit is adding only the login email to a
// provider onboarded without one (Charlene, Sep 30 2026).
class UpdateProviderDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() credentials?: string;
  @IsOptional() @IsString() specialty?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() officeLocation?: string;
  @IsOptional() isVirtual?: boolean;
  @IsOptional() isInPerson?: boolean;
  @IsOptional() @IsString() loginEmail?: string;
  @IsOptional() @IsString() @MinLength(8) loginPassword?: string;
  // Charlene, Oct 2 2026 — per-provider session length for open-slot
  // generation. Min 15 as a sanity floor, nothing enforced at the high end
  // (a 2-4hr block is a real, named use case elsewhere in this project).
  @IsOptional() @IsInt() @Min(15) defaultSlotDurationMin?: number;
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
  // Weekly recurrence — one or more weekdays per block (Charlene Sep 6 2026:
  // recurring blocks needed to span multiple days a week, not just one).
  @IsOptional() @IsArray() @ArrayMinSize(1) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true })
  daysOfWeek?: number[];
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
  @Roles(...ALL_STAFF)
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

  // Partner onboarding (Charlene, Sep 24 2026) — admin-only, creates a
  // provider's business/clinical profile and optionally their login.
  // Response is flattened (provider fields + tempPassword) rather than
  // nested, so existing frontend code reading e.g. `created.id` still
  // works unchanged; tempPassword is simply absent (undefined) when no
  // login was requested or an explicit password was supplied.
  @Post()
  @Roles(...ADMIN_ONLY)
  async createProvider(@Body() dto: CreateProviderDto) {
    const { provider, tempPassword } = await this.providersService.create(dto);
    return { ...provider, tempPassword };
  }

  // Literal "self/*" routes MUST be declared before any ":id/*" routes below
  // — Express/Nest matches routes in declaration order, and ":id/blocks" /
  // ":id/recurring-block" would otherwise swallow "self/blocks" / "self/
  // recurring-block" (matching with id="self") and reject every provider
  // self-service call with a 403 from the admin-only @Roles guard on those
  // routes. This bit production: both self/recurring-block and self/blocks
  // (GET) were silently 403'ing for every provider before this fix.
  @Post('self/blocks')
  @Roles(...PROVIDER_ONLY)
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
  @Roles(...PROVIDER_ONLY)
  async getSelfCalendarFeed(@CurrentUser() user: User, @Req() req: Request) {
    const token = await this.providersService.getOrCreateCalendarFeedToken(user);
    const host = req.get('host') ?? '';
    // req.protocol reports http behind Railway's edge proxy without an
    // explicit "trust proxy" setting — assume https except on localhost,
    // rather than relying on that.
    const scheme = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
    const path = `/api/v1/calendar/feed/${token}.ics`;
    return { url: `${scheme}://${host}${path}`, webcalUrl: `webcal://${host}${path}` };
  }

  @Post('self/recurring-block')
  @Roles(...PROVIDER_ONLY)
  createSelfRecurringBlock(@Body() dto: RecurringBlockDto, @CurrentUser() user: User) {
    return this.providersService.createSelfRecurringBlock(user, {
      frequency: dto.frequency,
      daysOfWeek: dto.daysOfWeek,
      dayOfMonth: dto.dayOfMonth,
      startTime: dto.startTime,
      endTime: dto.endTime,
      endDate: dto.endDate,
      weeks: dto.weeks,
      reason: dto.reason,
    });
  }

  @Get('self/blocks')
  @Roles(...PROVIDER_ONLY)
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

  @Get(':id/schedule')
  @Roles(...ALL_STAFF)
  getSchedule(@Param('id') id: string, @Query('date') date?: string, @CurrentUser() user?: User) {
    return this.providersService.getSchedule(id, date, user!);
  }

  @Get(':id/fill-candidates')
  @Roles(...OFFICE_STAFF)
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
  @Roles(...OFFICE_STAFF)
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
  @Roles(...OFFICE_STAFF)
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

  // Charlene (Sep 30 2026 — agent parity): "an agent should not be able to
  // onboard a partner. They can, however, adjust their business hours and
  // block times." These four widen from PRACTICE_MANAGEMENT to OFFICE_STAFF
  // (adds SCHEDULING_AGENT); provider create/edit/login/reset below stay
  // PRACTICE_MANAGEMENT-only — that's the "onboarding" half agents don't
  // get. assertCanManage() also had to change (see providers.service.ts) —
  // agents are meant to be cross-practice everywhere else in this app
  // (search, dashboard, fill-candidates), and leaving it unchanged would
  // have 403'd an agent on every single practice, the exact "nav lets you
  // in, first call fails" bug already found and fixed twice this session.
  @Get(':id/availability')
  @Roles(...OFFICE_STAFF)
  getAvailability(@Param('id') id: string, @CurrentUser() user: User) {
    return this.providersService.getAvailability(id, user);
  }

  @Put(':id/availability')
  @Roles(...OFFICE_STAFF)
  replaceAvailability(
    @Param('id') id: string,
    @Body() dto: ReplaceAvailabilityDto,
    @CurrentUser() user: User,
  ) {
    return this.providersService.replaceAvailability(id, dto.windows, user);
  }

  @Get(':id/blocks')
  @Roles(...OFFICE_STAFF)
  getBlocksForAdmin(@Param('id') id: string, @CurrentUser() user: User) {
    return this.providersService.getBlocksForAdmin(id, user);
  }

  @Post(':id/recurring-block')
  @Roles(...OFFICE_STAFF)
  createRecurringBlock(
    @Param('id') id: string,
    @Body() dto: RecurringBlockDto,
    @CurrentUser() user: User,
  ) {
    return this.providersService.createRecurringBlock(
      id,
      {
        frequency: dto.frequency,
        daysOfWeek: dto.daysOfWeek,
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
  @Roles(...OFFICE_STAFF)
  deleteBlock(
    @Param('id') id: string,
    @Param('blockId') blockId: string,
    @CurrentUser() user: User,
  ) {
    return this.providersService.deleteBlock(id, blockId, user);
  }

  // Declared down here with the other ":id" routes, after every literal
  // "self/*" route above — see the route-ordering note on self/blocks.
  @Patch(':id')
  @Roles(...PRACTICE_MANAGEMENT)
  async updateProvider(
    @Param('id') id: string,
    @Body() dto: UpdateProviderDto,
    @CurrentUser() user: User,
  ) {
    const { provider, tempPassword } = await this.providersService.update(id, dto, user);
    return { ...provider, tempPassword };
  }

  // Reset a provider's login — always issues a fresh temp password and
  // forces a change on next sign-in (Charlene, Sep 30 2026 — the practical
  // "they forgot it / never got it" recovery path).
  @Post(':id/reset-password')
  @Roles(...PRACTICE_MANAGEMENT)
  resetProviderPassword(@Param('id') id: string, @CurrentUser() user: User) {
    return this.providersService.resetLoginPassword(id, user);
  }
}
