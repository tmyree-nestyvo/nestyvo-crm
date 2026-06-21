import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Appointment } from './appointment.entity';
import { Provider } from './provider.entity';
import { ProviderAppointmentType } from './provider-appointment-type.entity';

export enum FillOpportunityStatus {
  OPEN = 'open',
  FILLED = 'filled',
  EXPIRED = 'expired',
}

@Entity('fill_opportunities')
export class FillOpportunity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sourceAppointmentId: string;

  @ManyToOne(() => Appointment)
  @JoinColumn({ name: 'sourceAppointmentId' })
  sourceAppointment: Appointment;

  @Column()
  providerId: string;

  @ManyToOne(() => Provider)
  @JoinColumn({ name: 'providerId' })
  provider: Provider;

  @Column({ type: 'timestamptz' })
  slotStartAt: Date;

  @Column({ type: 'timestamptz' })
  slotEndAt: Date;

  @Column({ nullable: true })
  appointmentTypeId: string;

  @ManyToOne(() => ProviderAppointmentType, { nullable: true })
  @JoinColumn({ name: 'appointmentTypeId' })
  appointmentType: ProviderAppointmentType;

  @Column({ type: 'enum', enum: FillOpportunityStatus, default: FillOpportunityStatus.OPEN })
  status: FillOpportunityStatus;

  @Column({ nullable: true })
  filledAppointmentId: string;

  @ManyToOne(() => Appointment, { nullable: true })
  @JoinColumn({ name: 'filledAppointmentId' })
  filledAppointment: Appointment;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date;
}
