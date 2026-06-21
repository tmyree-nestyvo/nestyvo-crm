import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Practice } from './practice.entity';
import { Provider } from './provider.entity';
import { User } from './user.entity';

export enum PreferredContact {
  PHONE = 'phone',
  EMAIL = 'email',
  SMS = 'sms',
}

export enum WaitlistStatus {
  NONE = 'none',
  ACTIVE = 'active',
  SCHEDULED = 'scheduled',
}

@Entity('patients')
export class Patient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  practiceId: string;

  @ManyToOne(() => Practice)
  @JoinColumn({ name: 'practiceId' })
  practice: Practice;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ type: 'date', nullable: true })
  dob: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  email: string;

  @Column({ type: 'enum', enum: PreferredContact, default: PreferredContact.PHONE })
  preferredContact: PreferredContact;

  @Column({ type: 'jsonb', nullable: true })
  insuranceInfo: Record<string, any>;

  @Column({ nullable: true })
  assignedProviderId: string;

  @ManyToOne(() => Provider, { nullable: true })
  @JoinColumn({ name: 'assignedProviderId' })
  assignedProvider: Provider;

  @Column({ nullable: true })
  referralSource: string;

  @Column({ type: 'enum', enum: WaitlistStatus, default: WaitlistStatus.NONE })
  waitlistStatus: WaitlistStatus;

  @Column({ type: 'text', nullable: true })
  notes: string;

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
