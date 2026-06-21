import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Between } from 'typeorm';
import { Provider } from '../../database/entities/provider.entity';
import { Appointment, AppointmentStatus } from '../../database/entities/appointment.entity';
import { AgentProviderAssignment } from '../../database/entities/agent-provider-assignment.entity';
import { User, UserRole } from '../../database/entities/user.entity';

@Injectable()
export class ProvidersService {
  constructor(
    @InjectRepository(Provider) private providerRepo: Repository<Provider>,
    @InjectRepository(Appointment) private appointmentRepo: Repository<Appointment>,
    @InjectRepository(AgentProviderAssignment) private assignmentRepo: Repository<AgentProviderAssignment>,
  ) {}

  async listForUser(user: User): Promise<Provider[]> {
    if (user.role === UserRole.ADMINISTRATOR) {
      return this.providerRepo.find({ where: { isActive: true } as any, order: { lastName: 'ASC' } });
    }

    if (user.role === UserRole.PRACTICE_MANAGER) {
      return this.providerRepo.find({
        where: { practiceId: user.practiceId } as any,
        order: { lastName: 'ASC' },
      });
    }

    if (user.role === UserRole.SCHEDULING_AGENT) {
      const assignments = await this.assignmentRepo.find({
        where: { agentUserId: user.id, isActive: true },
      });
      if (!assignments.length) return [];
      return this.providerRepo.findBy({ id: In(assignments.map((a) => a.providerId)) });
    }

    // Provider sees themselves
    const self = await this.providerRepo.findOne({ where: { userId: user.id } });
    return self ? [self] : [];
  }

  async getSchedule(providerId: string, date?: string): Promise<any[]> {
    const target = date ? new Date(date + 'T00:00:00') : new Date();
    const start = new Date(target);
    start.setHours(0, 0, 0, 0);
    const end = new Date(target);
    end.setHours(23, 59, 59, 999);

    const appointments = await this.appointmentRepo.find({
      where: {
        providerId,
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

  async findByUserId(userId: string): Promise<Provider | null> {
    return this.providerRepo.findOne({ where: { userId } });
  }
}
