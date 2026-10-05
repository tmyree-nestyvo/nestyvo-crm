import { Entity, PrimaryGeneratedColumn, Generated, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Practice } from './practice.entity';
import { Patient } from './patient.entity';
import { User } from './user.entity';

export enum TicketCategory {
  // Charlene, Phase 8 item 22 (Oct 5 2026) — the Provider Request form's
  // selectable set is now exactly OUTBOUND_CALL/RESCHEDULE_REQUEST/
  // TECHNICAL/OTHER. The three legacy values below are kept (not removed —
  // Postgres enum values can't be dropped without recreating the whole
  // type, and real historical tickets already use them) purely so old
  // tickets keep displaying correctly; nothing creates them going forward.
  OUTBOUND_CALL = 'outbound_call',
  RESCHEDULE_REQUEST = 'reschedule_request',
  TECHNICAL = 'technical',
  OTHER = 'other',
  SCHEDULING = 'scheduling',
  BILLING = 'billing',
  CLINICAL = 'clinical',
}

export enum TicketPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
}

export enum TicketStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

@Entity('tickets')
export class Ticket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Human-readable sequential ticket number (display as "T-1042"), separate
  // from the UUID primary key — Charlene's Sep 5 ask, so agents/providers/
  // partners have something to reference on a call instead of a UUID.
  @Column({ type: 'int' })
  @Generated('increment')
  ticketNumber: number;

  @Column()
  practiceId: string;

  @ManyToOne(() => Practice)
  @JoinColumn({ name: 'practiceId' })
  practice: Practice;

  @Column({ nullable: true })
  patientId: string | null;

  @ManyToOne(() => Patient, { nullable: true })
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  @Column({ type: 'enum', enum: TicketCategory, default: TicketCategory.OTHER })
  category: TicketCategory;

  @Column({ type: 'enum', enum: TicketPriority, default: TicketPriority.NORMAL })
  priority: TicketPriority;

  @Column()
  subject: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: TicketStatus, default: TicketStatus.OPEN })
  status: TicketStatus;

  @Column()
  createdByUserId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'createdByUserId' })
  createdByUser: User;

  @Column({ nullable: true })
  assignedToUserId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assignedToUserId' })
  assignedToUser: User;

  @Column({ type: 'text', nullable: true })
  resolutionNotes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;
}
