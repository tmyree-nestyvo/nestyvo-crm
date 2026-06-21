import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Provider } from './provider.entity';
import { Patient } from './patient.entity';
import { ProviderAppointmentType } from './provider-appointment-type.entity';
import { User } from './user.entity';

export enum AppointmentStatus {
  SCHEDULED = 'scheduled',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no_show',
  RESCHEDULED = 'rescheduled',
}

export enum LocationType {
  VIRTUAL = 'virtual',
  IN_PERSON = 'in_person',
}

@Entity('appointments')
export class Appointment {
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

  @Column({ type: 'timestamptz' })
  startAt: Date;

  @Column({ type: 'timestamptz' })
  endAt: Date;

  @Column({ type: 'enum', enum: LocationType, default: LocationType.IN_PERSON })
  locationType: LocationType;

  @Column({ type: 'enum', enum: AppointmentStatus, default: AppointmentStatus.SCHEDULED })
  status: AppointmentStatus;

  @Column({ nullable: true })
  rescheduledFromId: string;

  @ManyToOne(() => Appointment, { nullable: true })
  @JoinColumn({ name: 'rescheduledFromId' })
  rescheduledFrom: Appointment;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date;

  @Column({ nullable: true })
  cancellationReason: string;

  @Column({ nullable: true })
  createdBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'createdBy' })
  createdByUser: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
