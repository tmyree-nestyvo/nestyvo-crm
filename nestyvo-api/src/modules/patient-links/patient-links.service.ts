import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PatientLink } from '../../database/entities/patient-link.entity';
import { Patient } from '../../database/entities/patient.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { User } from '../../database/entities/user.entity';

@Injectable()
export class PatientLinksService {
  constructor(
    @InjectRepository(PatientLink) private linkRepo: Repository<PatientLink>,
    @InjectRepository(Patient) private patientRepo: Repository<Patient>,
    @InjectRepository(AuditLog) private auditRepo: Repository<AuditLog>,
  ) {}

  async listLinks(patientId: string) {
    const links = await this.linkRepo.find({
      where: [{ patientAId: patientId }, { patientBId: patientId }],
      relations: { patientA: { practice: true }, patientB: { practice: true } },
    });
    return links.map((link) => {
      const other = link.patientAId === patientId ? link.patientB : link.patientA;
      return {
        linkId: link.id,
        patientId: other.id,
        name: `${other.firstName} ${other.lastName}`,
        practiceName: other.practice.name,
        notes: link.notes,
        createdAt: link.createdAt,
      };
    });
  }

  async suggestMatches(patientId: string) {
    const patient = await this.patientRepo.findOne({ where: { id: patientId } });
    if (!patient || (!patient.phone && !patient.email)) return [];

    const where: any[] = [];
    if (patient.phone) where.push({ phone: patient.phone });
    if (patient.email) where.push({ email: patient.email });

    const candidates = await this.patientRepo.find({ where, relations: { practice: true } });

    const existingLinks = await this.linkRepo.find({
      where: [{ patientAId: patientId }, { patientBId: patientId }],
    });
    const linkedIds = new Set(
      existingLinks.flatMap((l) => [l.patientAId, l.patientBId]).filter((id) => id !== patientId),
    );

    return candidates
      .filter((c) => c.id !== patientId && c.practiceId !== patient.practiceId && !linkedIds.has(c.id))
      .map((c) => ({
        patientId: c.id,
        name: `${c.firstName} ${c.lastName}`,
        practiceName: c.practice.name,
        matchedOn: c.phone && c.phone === patient.phone ? 'phone' : 'email',
      }));
  }

  async createLink(patientAId: string, patientBId: string, notes: string | undefined, user: User) {
    if (patientAId === patientBId) throw new BadRequestException('Cannot link a patient to themselves');
    const [a, b] = patientAId < patientBId ? [patientAId, patientBId] : [patientBId, patientAId];

    const existing = await this.linkRepo.findOne({ where: { patientAId: a, patientBId: b } });
    if (existing) throw new ConflictException('These patients are already linked');

    const saved = await this.linkRepo.save(this.linkRepo.create({ patientAId: a, patientBId: b, notes, linkedBy: user.id }));

    await this.auditRepo.save(
      this.auditRepo.create({
        userId: user.id,
        action: 'patient_link.create',
        resourceType: 'patient_link',
        resourceId: saved.id,
        newValues: { patientAId: a, patientBId: b },
      }),
    );

    return { id: saved.id };
  }

  async removeLink(linkId: string, user: User) {
    const link = await this.linkRepo.findOne({ where: { id: linkId } });
    if (!link) return { error: 'Link not found' };
    await this.linkRepo.remove(link);
    await this.auditRepo.save(
      this.auditRepo.create({
        userId: user.id,
        action: 'patient_link.delete',
        resourceType: 'patient_link',
        resourceId: linkId,
        oldValues: { patientAId: link.patientAId, patientBId: link.patientBId },
      }),
    );
    return { success: true };
  }
}
