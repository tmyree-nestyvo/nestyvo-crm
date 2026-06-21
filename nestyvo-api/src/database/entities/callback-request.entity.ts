import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Patient } from './patient.entity';
import { User } from './user.entity';

export enum CallbackSource {
  MISSED_CALL = 'missed_call',
  VOICEMAIL = 'voicemail',
  WEBSITE = 'website',
  RESCHEDULING_REQUEST = 'rescheduling_request',
  AGENT_CREATED = 'agent_created',
}

export enum CallbackStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  OVERDUE = 'overdue',
}

@Entity('callback_requests')
export class CallbackRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  patientId: string;

  @ManyToOne(() => Patient)
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  @Column({ type: 'enum', enum: CallbackSource })
  source: CallbackSource;

  @Column({ type: 'enum', enum: CallbackStatus, default: CallbackStatus.OPEN })
  status: CallbackStatus;

  @Column({ nullable: true })
  assignedAgentId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assignedAgentId' })
  assignedAgent: User;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'timestamptz', nullable: true })
  dueAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
