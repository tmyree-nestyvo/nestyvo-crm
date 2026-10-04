import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Provider } from './provider.entity';
import { ExternalCalendarFeed, ExternalCalendarSource } from './external-calendar-feed.entity';

// One synced VEVENT from a provider's external calendar feed (see
// ExternalCalendarFeed). Deliberately stores only what's needed to keep
// Nestyvo from double-booking over it and to show it on a schedule — the
// feed's own (already-generic) summary, start/end, nothing clinical.
// Upserted by externalUid on every sync; rows no longer present in a fresh
// fetch are deleted (ExternalCalendarSyncService.syncFeed) since these
// appointments move/cancel on the source platform.
@Entity('external_busy_blocks')
@Index(['feedId', 'externalUid'], { unique: true })
export class ExternalBusyBlock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  providerId: string;

  @ManyToOne(() => Provider, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'providerId' })
  provider: Provider;

  @Column()
  feedId: string;

  @ManyToOne(() => ExternalCalendarFeed, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'feedId' })
  feed: ExternalCalendarFeed;

  @Column({ type: 'enum', enum: ExternalCalendarSource })
  source: ExternalCalendarSource;

  @Column()
  externalUid: string;

  @Column({ type: 'timestamptz' })
  startAt: Date;

  @Column({ type: 'timestamptz' })
  endAt: Date;

  @Column()
  summary: string;

  // Workstream C (Oct 3 2026) — raw-feed inspection of both of Gencia's
  // real live feeds (see ExternalCalendarSyncService) found a real,
  // per-event telehealth link in Rula's DESCRIPTION field (unique per
  // session) and Headway's own static room link in theirs, plus a real
  // LOCATION on Headway events ("Telehealth"). Neither feed's SUMMARY,
  // DESCRIPTION, or any other field carries a client/patient name anywhere
  // — confirmed across all 160 real events on the account, both platforms
  // — so that part of the original ask isn't buildable from this data and
  // is flagged back separately, not silently worked around here.
  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', nullable: true })
  telehealthLink: string | null;

  // Charlene, Oct 4 2026 — confirmed from the provider's own subscribed-
  // calendar screenshots: a separate platform-management link, distinct
  // from the telehealth join link (Rula's provider portal, Headway's
  // per-event "manage this appointment" deep link).
  @Column({ type: 'varchar', nullable: true })
  managementLink: string | null;

  @Column({ type: 'varchar', nullable: true })
  location: string | null;

  @Column({ type: 'timestamptz' })
  lastSeenAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
