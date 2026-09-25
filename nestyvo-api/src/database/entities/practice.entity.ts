import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';

// Placeholder only — no real billing/payment integration exists yet.
// Charlene (Sep 24 2026, see [[charlene_requirements]]): wants a place to
// note whether a partner has paid their monthly subscription and when it
// expires, admin-editable by hand until a real billing integration exists.
export enum SubscriptionStatus {
  TRIAL = 'trial',
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
}

@Entity('practices')
export class Practice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  email: string;

  // Primary point-of-contact person at the partner business — distinct from
  // the general office phone/email above. Charlene: "acquire all of their
  // business info that we need to run or partner with them."
  @Column({ nullable: true })
  contactName: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ default: 'America/Los_Angeles' })
  timezone: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: true })
  remindersEnabled: boolean;

  @Column({ type: 'enum', enum: SubscriptionStatus, default: SubscriptionStatus.TRIAL })
  subscriptionStatus: SubscriptionStatus;

  // "When their subscription expires" — a date to watch, not an enforcement
  // mechanism. Nothing reads this to gate access yet.
  @Column({ type: 'date', nullable: true })
  subscriptionExpiresAt: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
