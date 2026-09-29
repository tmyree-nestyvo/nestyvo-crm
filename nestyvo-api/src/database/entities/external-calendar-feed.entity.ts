import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Provider } from './provider.entity';

export enum ExternalCalendarSource {
  RULA = 'rula',
  HEADWAY = 'headway',
  OTHER = 'other',
}

// A provider's own read-only .ics subscription URL from an outside
// scheduling platform (Charlene, Sep 28-29 2026 — Rula and Headway both
// publish one, a real documented feature: "Exporting your Rula calendar",
// Headway's own equivalent). Verified the raw feed content itself carries
// no patient PHI at all — Rula titles every event "Rula - existing/new
// client appointment", Headway titles them "Patient Appointment"/"Intake
// Call" — both deliberately generic, same privacy posture Nestyvo's own
// outbound calendar feed already uses (see Provider.calendarFeedToken).
// That's what makes this safe to ingest and store: it's busy/free
// scheduling data, not clinical or identifying data.
@Entity('external_calendar_feeds')
export class ExternalCalendarFeed {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  providerId: string;

  @ManyToOne(() => Provider, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'providerId' })
  provider: Provider;

  @Column({ type: 'enum', enum: ExternalCalendarSource })
  source: ExternalCalendarSource;

  @Column({ type: 'text' })
  feedUrl: string;

  @Column({ nullable: true })
  label: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastSyncedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  lastSyncError: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
