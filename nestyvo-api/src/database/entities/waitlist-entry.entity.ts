import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Provider } from './provider.entity';
import { Patient } from './patient.entity';
import { ProviderAppointmentType } from './provider-appointment-type.entity';
import { User } from './user.entity';

export enum WaitlistType {
  NEW_PATIENT = 'new_patient',
  FOLLOWUP = 'followup',
  URGENT = 'urgent',
}

export enum WaitlistEntryStatus {
  ACTIVE = 'active',
  CONTACTED = 'contacted',
  SCHEDULED = 'scheduled',
  REMOVED = 'removed',
}

@Entity('waitlist_entries')
export class WaitlistEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  providerId: string;

  @ManyToOne(() => Provider)
  @JoinColumn({ name: 'providerId' })
  provider: Provider;

  @Column()
  patientId: string;

  @ManyToOne(() => Patient)
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  @Column({ nullable: true })
  appointmentTypeId: string;

  @ManyToOne(() => ProviderAppointmentType, { nullable: true })
  @JoinColumn({ name: 'appointmentTypeId' })
  appointmentType: ProviderAppointmentType;

  @Column({ type: 'enum', enum: WaitlistType, default: WaitlistType.NEW_PATIENT })
  waitlistType: WaitlistType;

  @Column({ type: 'smallint', array: true, nullable: true })
  preferredDays: number[]; // 0=Sun…6=Sat

  @Column({ type: 'jsonb', nullable: true })
  preferredTimes: Record<string, boolean>; // { morning: true, afternoon: false, evening: false }

  @Column({ default: 0 })
  priorityScore: number;

  @Column({ type: 'enum', enum: WaitlistEntryStatus, default: WaitlistEntryStatus.ACTIVE })
  status: WaitlistEntryStatus;

  @Column({ type: 'timestamptz' })
  dateAdded: Date;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ nullable: true })
  createdBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'createdBy' })
  createdByUser: User;

  @UpdateDateColumn()
  updatedAt: Date;
}
