import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, In, Raw } from 'typeorm';
import { Patient } from '../../database/entities/patient.entity';
import { Appointment, AppointmentStatus } from '../../database/entities/appointment.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { Provider } from '../../database/entities/provider.entity';
import { ClientTag } from '../../database/entities/client-tag.entity';

@Injectable()
export class PatientsService {
  constructor(
    @InjectRepository(Patient) private patientRepo: Repository<Patient>,
    @InjectRepository(Appointment) private appointmentRepo: Repository<Appointment>,
    @InjectRepository(AuditLog) private auditRepo: Repository<AuditLog>,
    @InjectRepository(Provider) private providerRepo: Repository<Provider>,
    @InjectRepository(ClientTag) private tagRepo: Repository<ClientTag>,
  ) {}

  async search(query: string, user: User): Promise<any[]> {
    // Admins and scheduling agents work across every partner practice — agents are
    // Charlene's offshore team, not tied to one office, so they search everyone.
    // Practice managers and providers stay scoped to their own practice.
    const isCrossPractice = user.role === UserRole.ADMINISTRATOR || user.role === UserRole.SCHEDULING_AGENT;
    const baseWhere = isCrossPractice ? {} : { practiceId: user.practiceId };

    const where: any[] = [
      { ...baseWhere, firstName: ILike(`%${query}%`) },
      { ...baseWhere, lastName: ILike(`%${query}%`) },
      { ...baseWhere, phone: ILike(`%${query}%`) },
      { ...baseWhere, email: ILike(`%${query}%`) },
    ];

    // Phone numbers are stored formatted ("(202) 555-0100"); a digits-only search
    // like "2025550100" wouldn't substring-match that. Compare on digits only too.
    const digits = query.replace(/\D/g, '');
    if (digits.length >= 3) {
      where.push({
        ...baseWhere,
        phone: Raw((alias) => `regexp_replace(${alias}, '[^0-9]', '', 'g') ILIKE :digits`, {
          digits: `%${digits}%`,
        }),
      });
    }

    const patients = await this.patientRepo.find({
      where,
      relations: { assignedProvider: true, practice: true },
      take: 20,
      order: { lastName: 'ASC' },
    });

    return patients.map((p) => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      phone: p.phone,
      email: p.email,
      practiceName: p.practice.name,
      waitlistStatus: p.waitlistStatus,
      assignedProvider: p.assignedProvider
        ? `${p.assignedProvider.firstName} ${p.assignedProvider.lastName}`
        : null,
    }));
  }

  async findById(id: string): Promise<any> {
    const patient = await this.patientRepo.findOne({
      where: { id },
      relations: { assignedProvider: true, tag: true, practice: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const recentAppointments = await this.appointmentRepo.find({
      where: { patientId: id },
      relations: { provider: true, appointmentType: true },
      order: { startAt: 'DESC' },
      take: 10,
    });

    return {
      id: patient.id,
      name: `${patient.firstName} ${patient.lastName}`,
      dob: patient.dob,
      phone: patient.phone,
      email: patient.email,
      preferredContact: patient.preferredContact,
      referralSource: patient.referralSource,
      waitlistStatus: patient.waitlistStatus,
      practiceId: patient.practiceId,
      practiceName: patient.practice.name,
      assignedProvider: patient.assignedProvider
        ? `${patient.assignedProvider.firstName} ${patient.assignedProvider.lastName}`
        : null,
      tag: patient.tag ? { id: patient.tag.id, name: patient.tag.name, blockMinutes: patient.tag.blockMinutes } : null,
      recentAppointments: recentAppointments.map((a) => ({
        id: a.id,
        startAt: a.startAt,
        provider: `${a.provider.firstName} ${a.provider.lastName}`,
        type: a.appointmentType?.name,
        status: a.status,
        locationType: a.locationType,
      })),
    };
  }

  async getRoster(user: User): Promise<{ active: any[]; inactive: any[] }> {
    let patients: Patient[];

    if (user.role === UserRole.PROVIDER) {
      const provider = await this.providerRepo.findOne({ where: { userId: user.id } });
      if (!provider) return { active: [], inactive: [] };
      patients = await this.patientRepo.find({
        where: { assignedProviderId: provider.id },
        order: { lastName: 'ASC', firstName: 'ASC' },
      });
    } else {
      patients = await this.patientRepo.find({
        where: { practiceId: user.practiceId },
        order: { lastName: 'ASC', firstName: 'ASC' },
      });
    }

    if (patients.length === 0) return { active: [], inactive: [] };

    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const patientIds = patients.map((p) => p.id);

    const allAppts = await this.appointmentRepo.find({
      where: { patientId: In(patientIds) },
      order: { startAt: 'DESC' },
    });

    const apptsByPatient = new Map<string, Appointment[]>();
    for (const a of allAppts) {
      if (!apptsByPatient.has(a.patientId)) apptsByPatient.set(a.patientId, []);
      apptsByPatient.get(a.patientId)!.push(a);
    }

    const mapped = patients.map((p) => {
      const appts = apptsByPatient.get(p.id) ?? [];
      const lastAppt = appts.find(
        (a) => new Date(a.startAt) <= now && a.status === AppointmentStatus.COMPLETED,
      );
      const nextAppt = [...appts].reverse().find(
        (a) => new Date(a.startAt) > now && a.status === AppointmentStatus.SCHEDULED,
      );

      const isActive = !!(
        (lastAppt && new Date(lastAppt.startAt) >= ninetyDaysAgo) || nextAppt
      );

      let age: number | null = null;
      if (p.dob) {
        age = Math.floor(
          (now.getTime() - new Date(p.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000),
        );
      }

      return {
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        dob: p.dob,
        age,
        phone: p.phone,
        email: p.email,
        preferredContact: p.preferredContact,
        waitlistStatus: p.waitlistStatus,
        isActive,
        lastAppt: lastAppt?.startAt ?? null,
        nextAppt: nextAppt?.startAt ?? null,
      };
    });

    return {
      active: mapped.filter((p) => p.isActive),
      inactive: mapped.filter((p) => !p.isActive),
    };
  }

  async setTag(patientId: string, tagId: string | null, user: User) {
    const patient = await this.patientRepo.findOne({ where: { id: patientId } });
    if (!patient) throw new NotFoundException('Patient not found');

    if (tagId) {
      const tag = await this.tagRepo.findOne({ where: { id: tagId } });
      if (!tag) throw new NotFoundException('Tag not found');
      if (tag.practiceId !== patient.practiceId) {
        throw new BadRequestException('Tag belongs to a different practice');
      }
    }

    const oldTagId = patient.tagId;
    patient.tagId = tagId;
    await this.patientRepo.save(patient);

    await this.auditRepo.save(
      this.auditRepo.create({
        userId: user.id,
        action: 'patient.tag_update',
        resourceType: 'patient',
        resourceId: patientId,
        oldValues: { tagId: oldTagId },
        newValues: { tagId },
      }),
    );

    return { success: true, tagId };
  }

  async getContactAttempts(patientId: string): Promise<any[]> {
    const logs = await this.auditRepo.find({
      where: { resourceType: 'patient', resourceId: patientId },
      relations: { user: true },
      order: { createdAt: 'DESC' },
      take: 30,
    });

    return logs
      .filter((l) => l.action.startsWith('scheduling_attempt.'))
      .map((l) => ({
        id: l.id,
        outcome: l.action.replace('scheduling_attempt.', ''),
        attemptType: l.newValues?.attemptType,
        notes: l.newValues?.notes,
        agentName: l.user ? `${l.user.firstName} ${l.user.lastName}` : null,
        createdAt: l.createdAt,
      }));
  }
}
