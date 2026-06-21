import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, ILike } from 'typeorm';
import { User } from '../database/entities/user.entity';
import { Patient } from '../database/entities/patient.entity';
import { Appointment, AppointmentStatus } from '../database/entities/appointment.entity';
import { WaitlistEntry, WaitlistEntryStatus } from '../database/entities/waitlist-entry.entity';
import { FillOpportunity, FillOpportunityStatus } from '../database/entities/fill-opportunity.entity';
import { ProviderAvailability } from '../database/entities/provider-availability.entity';
import { ProviderBlock } from '../database/entities/provider-block.entity';
import { AuditLog } from '../database/entities/audit-log.entity';

@Injectable()
export class AgentToolExecutorService {
  private readonly logger = new Logger(AgentToolExecutorService.name);

  constructor(
    @InjectRepository(Patient) private patientRepo: Repository<Patient>,
    @InjectRepository(Appointment) private appointmentRepo: Repository<Appointment>,
    @InjectRepository(WaitlistEntry) private waitlistRepo: Repository<WaitlistEntry>,
    @InjectRepository(FillOpportunity) private fillOpRepo: Repository<FillOpportunity>,
    @InjectRepository(ProviderAvailability) private availabilityRepo: Repository<ProviderAvailability>,
    @InjectRepository(ProviderBlock) private blockRepo: Repository<ProviderBlock>,
    @InjectRepository(AuditLog) private auditRepo: Repository<AuditLog>,
  ) {}

  async execute(toolName: string, input: Record<string, any>, user: User): Promise<any> {
    this.logger.log(`Executing tool: ${toolName} for user: ${user.id}`);

    switch (toolName) {
      case 'search_patients':
        return this.searchPatients(input, user);
      case 'get_patient':
        return this.getPatient(input, user);
      case 'create_patient':
        return this.createPatient(input, user);
      case 'update_patient':
        return this.updatePatient(input, user);
      case 'search_provider_availability':
        return this.searchProviderAvailability(input);
      case 'get_provider_schedule':
        return this.getProviderSchedule(input);
      case 'schedule_appointment':
        return this.scheduleAppointment(input, user);
      case 'cancel_appointment':
        return this.cancelAppointment(input, user);
      case 'reschedule_appointment':
        return this.rescheduleAppointment(input, user);
      case 'search_waitlist':
        return this.searchWaitlist(input);
      case 'add_to_waitlist':
        return this.addToWaitlist(input, user);
      case 'get_waitlist':
        return this.getWaitlist(input);
      case 'remove_from_waitlist':
        return this.removeFromWaitlist(input, user);
      case 'log_scheduling_attempt':
        return this.logSchedulingAttempt(input, user);
      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  }

  private async searchPatients(input: any, user: User) {
    const { query } = input;
    const terms = query.trim().split(/\s+/);
    const where: any[] = [
      { phone: ILike(`%${query}%`) },
      { email: ILike(`%${query}%`) },
    ];
    // Single term: search first or last name
    if (terms.length === 1) {
      where.push({ firstName: ILike(`%${query}%`) });
      where.push({ lastName: ILike(`%${query}%`) });
    } else {
      // Multiple terms: first word = first name, rest = last name
      where.push({ firstName: ILike(`%${terms[0]}%`), lastName: ILike(`%${terms.slice(1).join(' ')}%`) });
      // Also try reversed: last word = first name
      where.push({ firstName: ILike(`%${terms[terms.length - 1]}%`), lastName: ILike(`%${terms.slice(0, -1).join(' ')}%`) });
    }
    const patients = await this.patientRepo.find({
      where,
      relations: { assignedProvider: true },
      take: 10,
    });
    return patients.map((p) => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      phone: p.phone,
      email: p.email,
      assignedProvider: p.assignedProvider
        ? `${p.assignedProvider.firstName} ${p.assignedProvider.lastName}`
        : null,
      waitlistStatus: p.waitlistStatus,
    }));
  }

  private async getPatient(input: any, user: User) {
    const patient = await this.patientRepo.findOne({
      where: { id: input.patient_id },
      relations: { assignedProvider: true },
    });
    if (!patient) return { error: 'Patient not found' };

    const appointments = await this.appointmentRepo.find({
      where: { patientId: patient.id },
      relations: { provider: true, appointmentType: true },
      order: { startAt: 'DESC' },
      take: 5,
    });

    return {
      id: patient.id,
      name: `${patient.firstName} ${patient.lastName}`,
      dob: patient.dob,
      phone: patient.phone,
      email: patient.email,
      preferredContact: patient.preferredContact,
      assignedProvider: patient.assignedProvider
        ? `${patient.assignedProvider.firstName} ${patient.assignedProvider.lastName}`
        : null,
      waitlistStatus: patient.waitlistStatus,
      recentAppointments: appointments.map((a) => ({
        id: a.id,
        date: a.startAt,
        provider: `${a.provider.firstName} ${a.provider.lastName}`,
        type: a.appointmentType?.name,
        status: a.status,
      })),
    };
  }

  private async createPatient(input: any, user: User) {
    const patient = this.patientRepo.create({
      practiceId: input.practice_id || user.practiceId,
      firstName: input.first_name,
      lastName: input.last_name,
      dob: input.dob,
      phone: input.phone,
      email: input.email,
      preferredContact: input.preferred_contact,
      referralSource: input.referral_source,
      assignedProviderId: input.assigned_provider_id,
      createdBy: user.id,
    });
    const saved = await this.patientRepo.save(patient);
    await this.audit('patient.create', 'patient', saved.id, null, saved, user);
    return { id: saved.id, name: `${saved.firstName} ${saved.lastName}` };
  }

  private async updatePatient(input: any, user: User) {
    const patient = await this.patientRepo.findOne({ where: { id: input.patient_id } });
    if (!patient) return { error: 'Patient not found' };
    const old = { ...patient };
    if (input.phone !== undefined) patient.phone = input.phone;
    if (input.email !== undefined) patient.email = input.email;
    if (input.preferred_contact !== undefined) patient.preferredContact = input.preferred_contact;
    if (input.assigned_provider_id !== undefined) patient.assignedProviderId = input.assigned_provider_id;
    if (input.notes !== undefined) patient.notes = input.notes;
    await this.patientRepo.save(patient);
    await this.audit('patient.update', 'patient', patient.id, old, patient, user);
    return { success: true };
  }

  private async searchProviderAvailability(input: any) {
    const { provider_id, start_date, end_date, duration_min } = input;
    const start = new Date(start_date);
    const end = new Date(end_date);

    const availability = await this.availabilityRepo.find({
      where: { providerId: provider_id, isActive: true },
    });

    const blocks = await this.blockRepo.find({
      where: {
        providerId: provider_id,
        startAt: Between(start, end),
      },
    });

    const bookedSlots = await this.appointmentRepo.find({
      where: {
        providerId: provider_id,
        status: AppointmentStatus.SCHEDULED,
        startAt: Between(start, end),
      },
    });

    // Build open slots from availability minus blocks and bookings
    const slots: { startAt: string; endAt: string }[] = [];
    const current = new Date(start);

    while (current <= end) {
      const dow = current.getDay();
      const dayAvailability = availability.filter((a) => a.dayOfWeek === dow);

      for (const avail of dayAvailability) {
        const [sh, sm] = avail.startTime.split(':').map(Number);
        const [eh, em] = avail.endTime.split(':').map(Number);
        let slotStart = new Date(current);
        slotStart.setHours(sh, sm, 0, 0);
        const dayEnd = new Date(current);
        dayEnd.setHours(eh, em, 0, 0);

        while (slotStart.getTime() + duration_min * 60000 <= dayEnd.getTime()) {
          const slotEnd = new Date(slotStart.getTime() + duration_min * 60000);
          const isBlocked = blocks.some(
            (b) => slotStart < b.endAt && slotEnd > b.startAt,
          );
          const isBooked = bookedSlots.some(
            (a) => slotStart < a.endAt && slotEnd > a.startAt,
          );
          if (!isBlocked && !isBooked) {
            slots.push({ startAt: slotStart.toISOString(), endAt: slotEnd.toISOString() });
          }
          slotStart = slotEnd;
        }
      }

      current.setDate(current.getDate() + 1);
    }

    return { slots: slots.slice(0, 20) };
  }

  private async getProviderSchedule(input: any) {
    const date = input.date ? new Date(input.date) : new Date();
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const appointments = await this.appointmentRepo.find({
      where: {
        providerId: input.provider_id,
        startAt: Between(start, end),
      },
      relations: { patient: true, appointmentType: true },
      order: { startAt: 'ASC' },
    });

    return appointments.map((a) => ({
      id: a.id,
      startAt: a.startAt,
      endAt: a.endAt,
      patient: `${a.patient.firstName} ${a.patient.lastName}`,
      type: a.appointmentType?.name,
      status: a.status,
      locationType: a.locationType,
    }));
  }

  private async scheduleAppointment(input: any, user: User) {
    const startAt = new Date(input.start_at);
    const apptType = input.appointment_type_id
      ? await this.appointmentRepo.manager.findOne('ProviderAppointmentType', {
          where: { id: input.appointment_type_id },
        })
      : null;
    const durationMin = (apptType as any)?.durationMin || 50;
    const endAt = new Date(startAt.getTime() + durationMin * 60000);

    const appt = this.appointmentRepo.create({
      providerId: input.provider_id,
      patientId: input.patient_id,
      appointmentTypeId: input.appointment_type_id,
      startAt,
      endAt,
      locationType: input.location_type,
      createdBy: user.id,
    });
    const saved = await this.appointmentRepo.save(appt);
    await this.audit('appointment.create', 'appointment', saved.id, null, saved, user);
    return { id: saved.id, startAt: saved.startAt, endAt: saved.endAt };
  }

  private async cancelAppointment(input: any, user: User) {
    const appt = await this.appointmentRepo.findOne({ where: { id: input.appointment_id } });
    if (!appt) return { error: 'Appointment not found' };

    const old = { ...appt };
    appt.status = AppointmentStatus.CANCELLED;
    appt.cancelledAt = new Date();
    appt.cancellationReason = input.reason;
    await this.appointmentRepo.save(appt);

    // Auto-create fill opportunity
    const fill = this.fillOpRepo.create({
      sourceAppointmentId: appt.id,
      providerId: appt.providerId,
      slotStartAt: appt.startAt,
      slotEndAt: appt.endAt,
      appointmentTypeId: appt.appointmentTypeId,
      status: FillOpportunityStatus.OPEN,
    });
    await this.fillOpRepo.save(fill);

    await this.audit('appointment.cancel', 'appointment', appt.id, old, appt, user);
    return { success: true, fillOpportunityId: fill.id };
  }

  private async rescheduleAppointment(input: any, user: User) {
    const appt = await this.appointmentRepo.findOne({ where: { id: input.appointment_id } });
    if (!appt) return { error: 'Appointment not found' };

    // Cancel original
    await this.cancelAppointment({ appointment_id: appt.id, reason: input.reason || 'Rescheduled' }, user);

    // Create new
    const newAppt = this.appointmentRepo.create({
      providerId: appt.providerId,
      patientId: appt.patientId,
      appointmentTypeId: appt.appointmentTypeId,
      startAt: new Date(input.new_start_at),
      endAt: new Date(new Date(input.new_start_at).getTime() + (appt.endAt.getTime() - appt.startAt.getTime())),
      locationType: appt.locationType,
      rescheduledFromId: appt.id,
      createdBy: user.id,
    });
    const saved = await this.appointmentRepo.save(newAppt);
    await this.audit('appointment.reschedule', 'appointment', saved.id, null, saved, user);
    return { id: saved.id, startAt: saved.startAt };
  }

  private async searchWaitlist(input: any) {
    const { provider_id, slot_start_at, appointment_type_id, limit = 10 } = input;
    const slotDate = new Date(slot_start_at);
    const dayOfWeek = slotDate.getDay();
    const hour = slotDate.getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

    const entries = await this.waitlistRepo.find({
      where: { providerId: provider_id, status: WaitlistEntryStatus.ACTIVE },
      relations: { patient: true, appointmentType: true },
      order: { priorityScore: 'DESC', dateAdded: 'ASC' },
    });

    const scored = entries.map((e) => {
      let score = e.priorityScore;
      if (e.preferredDays?.includes(dayOfWeek)) score += 20;
      if (e.preferredTimes?.[timeOfDay]) score += 10;
      if (appointment_type_id && e.appointmentTypeId === appointment_type_id) score += 30;
      const waitDays = Math.floor((Date.now() - new Date(e.dateAdded).getTime()) / 86400000);
      score += Math.min(waitDays, 50);
      return { entry: e, score };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map(({ entry: e, score }) => ({
      waitlistEntryId: e.id,
      patientId: e.patient.id,
      patientName: `${e.patient.firstName} ${e.patient.lastName}`,
      phone: e.patient.phone,
      waitlistType: e.waitlistType,
      appointmentType: e.appointmentType?.name,
      daysOnWaitlist: Math.floor((Date.now() - new Date(e.dateAdded).getTime()) / 86400000),
      preferredDaysMatch: e.preferredDays?.includes(dayOfWeek) ?? false,
      preferredTimeMatch: e.preferredTimes?.[timeOfDay] ?? false,
      matchScore: score,
    }));
  }

  private async addToWaitlist(input: any, user: User) {
    const entry = this.waitlistRepo.create({
      patientId: input.patient_id,
      providerId: input.provider_id,
      waitlistType: input.waitlist_type,
      appointmentTypeId: input.appointment_type_id,
      preferredDays: input.preferred_days,
      preferredTimes: input.preferred_times,
      dateAdded: new Date(),
      notes: input.notes,
      createdBy: user.id,
    });
    const saved = await this.waitlistRepo.save(entry);
    await this.audit('waitlist.add', 'waitlist_entry', saved.id, null, saved, user);
    return { id: saved.id };
  }

  private async getWaitlist(input: any) {
    const where: any = { providerId: input.provider_id, status: WaitlistEntryStatus.ACTIVE };
    if (input.waitlist_type) where.waitlistType = input.waitlist_type;

    const entries = await this.waitlistRepo.find({
      where,
      relations: { patient: true, appointmentType: true },
      order: { priorityScore: 'DESC', dateAdded: 'ASC' },
    });

    return entries.map((e) => ({
      id: e.id,
      patient: `${e.patient.firstName} ${e.patient.lastName}`,
      type: e.waitlistType,
      appointmentType: e.appointmentType?.name,
      daysWaiting: Math.floor((Date.now() - new Date(e.dateAdded).getTime()) / 86400000),
      preferredDays: e.preferredDays,
      preferredTimes: e.preferredTimes,
    }));
  }

  private async removeFromWaitlist(input: any, user: User) {
    const entry = await this.waitlistRepo.findOne({ where: { id: input.waitlist_entry_id } });
    if (!entry) return { error: 'Waitlist entry not found' };
    const old = { ...entry };
    entry.status = input.reason as WaitlistEntryStatus;
    await this.waitlistRepo.save(entry);
    await this.audit('waitlist.remove', 'waitlist_entry', entry.id, old, entry, user);
    return { success: true };
  }

  private async logSchedulingAttempt(input: any, user: User) {
    // Stored in audit log for now; a dedicated table can be added
    await this.audit(
      `scheduling_attempt.${input.outcome}`,
      'patient',
      input.patient_id,
      null,
      { attemptType: input.attempt_type, outcome: input.outcome, notes: input.notes },
      user,
    );
    return { success: true };
  }

  private async audit(
    action: string,
    resourceType: string,
    resourceId: string,
    oldValues: any,
    newValues: any,
    user: User,
  ) {
    const log = this.auditRepo.create({
      userId: user.id,
      action,
      resourceType,
      resourceId,
      oldValues,
      newValues,
    });
    await this.auditRepo.save(log);
  }
}
