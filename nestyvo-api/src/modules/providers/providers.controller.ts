import { Controller, Get, Post, Param, Query, Body, UseGuards } from '@nestjs/common';
import { IsString, IsOptional, IsEnum } from 'class-validator';
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

@Controller('providers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProvidersController {
  constructor(
    private providersService: ProvidersService,
    private fillCandidatesService: FillCandidatesService,
    @InjectRepository(Appointment) private appointmentRepo: Repository<Appointment>,
    @InjectRepository(AuditLog) private auditRepo: Repository<AuditLog>,
  ) {}

  @Get()
  @Roles(UserRole.ADMINISTRATOR, UserRole.SCHEDULING_AGENT, UserRole.PRACTICE_MANAGER, UserRole.PROVIDER)
  async list(@CurrentUser() user: User) {
    const providers = await this.providersService.listForUser(user);
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
}
