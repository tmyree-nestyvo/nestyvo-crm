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
