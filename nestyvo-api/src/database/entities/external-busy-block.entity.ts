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

  @Column({ type: 'timestamptz' })
  lastSeenAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
