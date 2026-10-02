import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Practice } from './practice.entity';

export enum UserRole {
  ADMINISTRATOR = 'administrator',
  SCHEDULING_AGENT = 'scheduling_agent',
  PROVIDER = 'provider',
  PRACTICE_MANAGER = 'practice_manager',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  cognitoId: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  firstName: string;

  @Column({ nullable: true })
  lastName: string;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  @Column({ nullable: true })
  practiceId: string;

  @ManyToOne(() => Practice, { nullable: true })
  @JoinColumn({ name: 'practiceId' })
  practice: Practice;

  @Column({ nullable: true })
  phone: string;

  @Column({ default: true })
  isActive: boolean;

  // Real password auth (Sep 30 2026 — Charlene: production must not
  // auto-log anyone in). Nullable because most existing rows predate this
  // and have no password yet — /auth/login treats a null hash as "account
  // not activated" rather than a crash. Never selected by default (see
  // AuthService) so a stray `find()` elsewhere in the codebase can't
  // accidentally leak it into an API response.
  @Column({ type: 'varchar', nullable: true, select: false })
  passwordHash: string | null;

  // Set whenever an admin creates a login or resets one — the account
  // works for exactly one sign-in with the temp password, then the
  // password-change screen is the only route Nestyvo lets it reach until
  // this clears. See PasswordChangeGuard.
  @Column({ default: false })
  mustChangePassword: boolean;

  // Forgot-password (Oct 1 2026 — Charlene got locked out and suggested
  // exactly this). select: false for the same reason as passwordHash — a
  // stray find() shouldn't leak an active reset token. Cleared on
  // successful reset (single-use) or left to just expire otherwise.
  @Column({ type: 'varchar', nullable: true, select: false })
  passwordResetTokenHash: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  passwordResetExpiresAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
