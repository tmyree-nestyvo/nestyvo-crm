import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Practice } from './practice.entity';
import { User } from './user.entity';

export enum ProviderStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  VACATION = 'vacation',
}

@Entity('providers')
export class Provider {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  practiceId: string;

  @ManyToOne(() => Practice)
  @JoinColumn({ name: 'practiceId' })
  practice: Practice;

  @Column({ nullable: true })
  userId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  credentials: string;

  @Column({ nullable: true })
  specialty: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  officeLocation: string;

  @Column({ default: false })
  isVirtual: boolean;

  @Column({ default: true })
  isInPerson: boolean;

  @Column({ type: 'enum', enum: ProviderStatus, default: ProviderStatus.ACTIVE })
  status: ProviderStatus;

  // Charlene, Oct 2 2026 — "we need to recognize 60 min block increments
  // instead of 50 mins": open-slot generation (computeSlotsByDate,
  // dashboard.service.ts) had a single global 50-min default with no
  // per-provider override at all, even though ProviderAppointmentType
  // already models real per-provider session lengths (Westside's own
  // providers already have a mix of 50/60/90-min types, never actually
  // read by slot generation). Rather than make slot generation consume
  // that richer, ambiguous (multiple types per provider) table — a bigger
  // change than "ship tomorrow" allows, and real risk to Westside's
  // already-working, already-demoed 50-min grid — this is a single
  // explicit column, defaulting to 50 so every existing provider's
  // behavior is byte-for-byte unchanged, set to 60 only for the one
  // provider (Peace of Mind's Gencia) that actually needs it right now.
  @Column({ type: 'int', default: 50 })
  defaultSlotDurationMin: number;

  @Column({ nullable: true })
  newPatientCapacity: number;

  @Column({ nullable: true })
  followupCapacity: number;

  @Column({ type: 'jsonb', nullable: true })
  schedulingPreferences: Record<string, any>;

  // Unguessable token for the provider's calendar-export feed (Sep 5 2026
  // ask — subscribe Nestyvo's schedule into iPhone/Google Calendar). The
  // feed endpoint is unauthenticated (calendar apps can't do a login flow),
  // so this token — not a JWT — is what protects it; keep it out of any
  // authenticated response except the provider's own "get my feed URL" call.
  @Column({ type: 'varchar', nullable: true, unique: true })
  calendarFeedToken: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
