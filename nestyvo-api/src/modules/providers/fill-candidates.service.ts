import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment, AppointmentStatus } from '../../database/entities/appointment.entity';
import { WaitlistEntry, WaitlistEntryStatus, WaitlistType } from '../../database/entities/waitlist-entry.entity';

export interface FillCandidate {
  patientId: string;
  name: string;
  phone: string;
  email: string;
  preferredContact: string;
  source: 'urgent_waitlist' | 'waitlist' | 'cadence';
  waitlistType?: string;
  daysWaiting?: number;
  // Visit history — populated for ALL candidates
  lastVisitDate?: string;
  cadenceDays?: number;
  nextExpectedVisit?: string;
  daysOverdue?: number;
  isDueForVisit: boolean;
  preferredDayMatch: boolean;
  preferredTimeMatch: boolean;
  score: number;
  waitlistEntryId?: string;
}

@Injectable()
export class FillCandidatesService {
  constructor(
    @InjectRepository(Appointment) private appointmentRepo: Repository<Appointment>,
    @InjectRepository(WaitlistEntry) private waitlistRepo: Repository<WaitlistEntry>,
  ) {}

  async getCandidates(
    providerId: string,
    slotStartAt: Date,
    slotEndAt: Date,
  ): Promise<FillCandidate[]> {
    const dayOfWeek = slotStartAt.getDay();
    const hour = slotStartAt.getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

    // Fetch all completed/scheduled appointments for this provider to build visit history map
    const allAppts = await this.appointmentRepo.find({
      where: { providerId, status: AppointmentStatus.COMPLETED },
      relations: { patient: true },
      order: { startAt: 'DESC' },
    });

    // Build visit history per patient: { lastVisit, cadenceDays }
    const visitHistory = buildVisitHistory(allAppts, slotStartAt);

    const [waitlistEntries, cadenceOnlyCandidates] = await Promise.all([
      this.getWaitlistCandidates(providerId, dayOfWeek, timeOfDay, visitHistory, slotStartAt),
      this.getCadenceCandidates(providerId, slotStartAt, visitHistory, allAppts),
    ]);

    // Merge — waitlist patients take precedence, no duplicates
    const waitlistPatientIds = new Set(waitlistEntries.map((c) => c.patientId));
    const merged = [
      ...waitlistEntries,
      ...cadenceOnlyCandidates.filter((c) => !waitlistPatientIds.has(c.patientId)),
    ];

    return merged.sort((a, b) => b.score - a.score).slice(0, 15);
  }

  private async getWaitlistCandidates(
    providerId: string,
    dayOfWeek: number,
    timeOfDay: string,
    visitHistory: Map<string, VisitInfo>,
    slotDate: Date,
  ): Promise<FillCandidate[]> {
    const entries = await this.waitlistRepo.find({
      where: { providerId, status: WaitlistEntryStatus.ACTIVE },
      relations: { patient: true, appointmentType: true },
      order: { priorityScore: 'DESC', dateAdded: 'ASC' },
    });

    return entries.map((e) => {
      const daysWaiting = Math.floor((Date.now() - new Date(e.dateAdded).getTime()) / 86_400_000);
      const preferredDayMatch = e.preferredDays?.includes(dayOfWeek) ?? false;
      const preferredTimeMatch = e.preferredTimes?.[timeOfDay] ?? false;
      const isUrgent = e.waitlistType === WaitlistType.URGENT;
      const visit = visitHistory.get(e.patientId);

      let score = e.priorityScore + Math.min(daysWaiting, 50);
      if (isUrgent) score += 100;
      if (preferredDayMatch) score += 20;
      if (preferredTimeMatch) score += 10;
      if (visit?.isDue) score += 15;

      return {
        patientId: e.patient.id,
        name: `${e.patient.firstName} ${e.patient.lastName}`,
        phone: e.patient.phone,
        email: e.patient.email,
        preferredContact: e.patient.preferredContact,
        source: isUrgent ? ('urgent_waitlist' as const) : ('waitlist' as const),
        waitlistType: e.waitlistType,
        daysWaiting,
        lastVisitDate: visit?.lastVisitDate,
        cadenceDays: visit?.cadenceDays,
        nextExpectedVisit: visit?.nextExpectedVisit,
        daysOverdue: visit?.daysOverdue,
        isDueForVisit: visit?.isDue ?? false,
        preferredDayMatch,
        preferredTimeMatch,
        score,
        waitlistEntryId: e.id,
      };
    });
  }

  private async getCadenceCandidates(
    providerId: string,
    slotDate: Date,
    visitHistory: Map<string, VisitInfo>,
    allAppts: Appointment[],
  ): Promise<FillCandidate[]> {
    const candidates: FillCandidate[] = [];
    const seenPatients = new Set<string>();

    for (const appt of allAppts) {
      if (seenPatients.has(appt.patientId)) continue;
      seenPatients.add(appt.patientId);

      const visit = visitHistory.get(appt.patientId);
      if (!visit || !visit.cadenceDays || !visit.isDue) continue;

      // Skip patients already on waitlist (handled separately)
      // Skip patients with a future scheduled appointment
      const hasFutureAppt = allAppts.some(
        (a) => a.patientId === appt.patientId &&
          a.status === AppointmentStatus.SCHEDULED &&
          new Date(a.startAt) > slotDate,
      );
      if (hasFutureAppt) continue;

      const score = 30 + Math.min(visit.daysOverdue ?? 0, 30);
      const patient = appt.patient;

      candidates.push({
        patientId: appt.patientId,
        name: `${patient.firstName} ${patient.lastName}`,
        phone: patient.phone,
        email: patient.email,
        preferredContact: patient.preferredContact,
        source: 'cadence',
        lastVisitDate: visit.lastVisitDate,
        cadenceDays: visit.cadenceDays,
        nextExpectedVisit: visit.nextExpectedVisit,
        daysOverdue: visit.daysOverdue,
        isDueForVisit: true,
        preferredDayMatch: false,
        preferredTimeMatch: false,
        score,
      });
    }

    return candidates;
  }
}

interface VisitInfo {
  lastVisitDate: string;
  cadenceDays: number | undefined;
  nextExpectedVisit: string | undefined;
  daysOverdue: number | undefined;
  isDue: boolean;
}

function buildVisitHistory(
  appointments: Appointment[],
  slotDate: Date,
): Map<string, VisitInfo> {
  const map = new Map<string, VisitInfo>();

  // Group by patient
  const byPatient = new Map<string, Appointment[]>();
  for (const a of appointments) {
    if (!byPatient.has(a.patientId)) byPatient.set(a.patientId, []);
    byPatient.get(a.patientId)!.push(a);
  }

  for (const [patientId, appts] of byPatient) {
    const sorted = appts.sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
    const lastVisit = new Date(sorted[0].startAt);

    let cadenceDays: number | undefined;
    let nextExpectedVisit: string | undefined;
    let daysOverdue: number | undefined;
    let isDue = false;

    if (sorted.length >= 2) {
      const gaps: number[] = [];
      for (let i = 0; i < Math.min(sorted.length - 1, 4); i++) {
        const gap = Math.abs(
          new Date(sorted[i].startAt).getTime() - new Date(sorted[i + 1].startAt).getTime(),
        ) / 86_400_000;
        if (gap >= 3 && gap <= 180) gaps.push(gap);
      }
      if (gaps.length > 0) {
        cadenceDays = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
        const expected = new Date(lastVisit.getTime() + cadenceDays * 86_400_000);
        nextExpectedVisit = expected.toISOString();
        const daysUntilDue = Math.floor((expected.getTime() - slotDate.getTime()) / 86_400_000);
        daysOverdue = Math.max(-daysUntilDue, 0);
        isDue = daysUntilDue <= 7; // due within 7 days of slot
      }
    }

    map.set(patientId, {
      lastVisitDate: lastVisit.toISOString(),
      cadenceDays,
      nextExpectedVisit,
      daysOverdue,
      isDue,
    });
  }

  return map;
}
