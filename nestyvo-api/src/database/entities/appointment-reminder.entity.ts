import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { Appointment } from './appointment.entity';

export enum ReminderType {
  NOTICE_24H = '24h',
  CANCEL_WINDOW_8H = '8h',
  DAY_OF = 'day_of',
}

export enum ReminderChannel {
  SMS = 'sms',
  EMAIL = 'email',
}

export enum ReminderStatus {
  PENDING = 'pending',
  SENT = 'sent',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

@Entity('appointment_reminders')
@Index(['status', 'scheduledFor'])
export class AppointmentReminder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  appointmentId: string;

  @ManyToOne(() => Appointment)
  @JoinColumn({ name: 'appointmentId' })
  appointment: Appointment;

  @Column({ type: 'enum', enum: ReminderType })
  type: ReminderType;

  @Column({ type: 'enum', enum: ReminderChannel, default: ReminderChannel.SMS })
  channel: ReminderChannel;

  @Column({ type: 'timestamptz' })
  scheduledFor: Date;

  @Column({ type: 'enum', enum: ReminderStatus, default: ReminderStatus.PENDING })
  status: ReminderStatus;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date;

  @Column({ type: 'text', nullable: true })
  failureReason: string;

  // Only set on the 8h reminder, at send time — the self-cancel window starts when the
  // patient actually receives the message, not when this row was created at booking.
  @Column({ type: 'timestamptz', nullable: true })
  cancelWindowExpiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledViaLinkAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
