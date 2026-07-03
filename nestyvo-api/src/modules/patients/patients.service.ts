import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, Like } from 'typeorm';
import { Patient } from '../../database/entities/patient.entity';
import { Appointment } from '../../database/entities/appointment.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { User, UserRole } from '../../database/entities/user.entity';

@Injectable()
export class PatientsService {
  constructor(
    @InjectRepository(Patient) private patientRepo: Repository<Patient>,
    @InjectRepository(Appointment) private appointmentRepo: Repository<Appointment>,
    @InjectRepository(AuditLog) private auditRepo: Repository<AuditLog>,
  ) {}

  async search(query: string, user: User): Promise<any[]> {
    const baseWhere = user.role === UserRole.ADMINISTRATOR ? {} : { practiceId: user.practiceId };

    const patients = await this.patientRepo.find({
      where: [
        { ...baseWhere, firstName: ILike(`%${query}%`) },
        { ...baseWhere, lastName: ILike(`%${query}%`) },
        { ...baseWhere, phone: ILike(`%${query}%`) },
        { ...baseWhere, email: ILike(`%${query}%`) },
      ],
      relations: { assignedProvider: true },
      take: 20,
      order: { lastName: 'ASC' },
    });

    return patients.map((p) => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      phone: p.phone,
      email: p.email,
      waitlistStatus: p.waitlistStatus,
      assignedProvider: p.assignedProvider
        ? `${p.assignedProvider.firstName} ${p.assignedProvider.lastName}`
        : null,
    }));
  }

  async findById(id: string): Promise<any> {
    const patient = await this.patientRepo.findOne({
      where: { id },
      relations: { assignedProvider: true },
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
      assignedProvider: patient.assignedProvider
        ? `${patient.assignedProvider.firstName} ${patient.assignedProvider.lastName}`
        : null,
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
