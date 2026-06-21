import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Patient } from './patient.entity';
import { Provider } from './provider.entity';
import { User } from './user.entity';
import { FillOpportunity } from './fill-opportunity.entity';
import { WaitlistEntry } from './waitlist-entry.entity';

export enum QueueType {
  CANCELLATION_FILL = 'cancellation_fill',
  WAITLIST_OUTREACH = 'waitlist_outreach',
  APPOINTMENT_CONFIRM = 'appointment_confirm',
  FOLLOWUP_SCHEDULING = 'followup_scheduling',
  RECALL = 'recall',
  NEW_PATIENT_INQUIRY = 'new_patient_inquiry',
}

export enum QueueStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('outreach_queue')
export class OutreachQueue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: QueueType })
  queueType: QueueType;

  @Column({ nullable: true })
  fillOpportunityId: string;

  @ManyToOne(() => FillOpportunity, { nullable: true })
  @JoinColumn({ name: 'fillOpportunityId' })
  fillOpportunity: FillOpportunity;

  @Column({ nullable: true })
  waitlistEntryId: string;

  @ManyToOne(() => WaitlistEntry, { nullable: true })
  @JoinColumn({ name: 'waitlistEntryId' })
  waitlistEntry: WaitlistEntry;

  @Column()
  patientId: string;

  @ManyToOne(() => Patient)
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  @Column({ nullable: true })
  providerId: string;

  @ManyToOne(() => Provider, { nullable: true })
  @JoinColumn({ name: 'providerId' })
  provider: Provider;

  @Column({ default: 0 })
  priority: number;

  @Column({ type: 'enum', enum: QueueStatus, default: QueueStatus.PENDING })
  status: QueueStatus;

  @Column({ nullable: true })
  assignedAgentId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assignedAgentId' })
  assignedAgent: User;

  @Column({ type: 'timestamptz', nullable: true })
  dueAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
