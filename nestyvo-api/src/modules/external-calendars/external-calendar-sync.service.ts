import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import * as ical from 'node-ical';
import { ExternalCalendarFeed, ExternalCalendarSource } from '../../database/entities/external-calendar-feed.entity';
import { ExternalBusyBlock } from '../../database/entities/external-busy-block.entity';

// Workstream C (Oct 3 2026) — extracted straight from inspecting both of
// Gencia's real, live feeds directly (not guessed): Rula puts a unique
// per-session join link in DESCRIPTION ("Join the session: <url>"),
// Headway puts its provider's own static room link in DESCRIPTION ("Join
// virtually at <url>"). Platform-aware since the two feeds don't share a
// format at all otherwise (Rula also has an X-ALT-DESC HTML duplicate,
// Headway doesn't). Falls back to null rather than throwing — an
// unexpected feed shape should never break the sync, same instinct as the
// rest of this file (skip malformed events rather than guess).
const TELEHEALTH_LINK_PATTERNS: Partial<Record<ExternalCalendarSource, RegExp>> = {
  [ExternalCalendarSource.RULA]: /https:\/\/join\.rula\.com\/\S+/,
  [ExternalCalendarSource.HEADWAY]: /https:\/\/sessions\.psychologytoday\.com\/\S+/,
};

// Charlene, Oct 4 2026 — confirmed directly from the provider's real
// subscribed-calendar screenshots (not just the raw feed) that both
// platforms also carry a separate platform-management link, distinct
// from the telehealth join link: Rula's is a generic provider-portal URL
// (same every event), Headway's is a real per-event deep link ("View the
// patient appointment at https://sigmund.headway.co/calendar?event_id=
// ...&start_date=..."). Different domain per source, so no risk of
// colliding with the telehealth patterns above.
const MANAGEMENT_LINK_PATTERNS: Partial<Record<ExternalCalendarSource, RegExp>> = {
  [ExternalCalendarSource.RULA]: /https:\/\/provider\.pathapplication\.com\S*/,
  [ExternalCalendarSource.HEADWAY]: /https:\/\/sigmund\.headway\.co\/calendar\?\S+/,
};

function extractLink(
  patterns: Partial<Record<ExternalCalendarSource, RegExp>>,
  source: ExternalCalendarSource,
  description: string | null,
): string | null {
  if (!description) return null;
  const pattern = patterns[source];
  if (!pattern) return null;
  const match = description.match(pattern);
  // Trailing "." from a sentence ending right after the URL (seen in
  // Rula's own description text) isn't part of the link.
  return match ? match[0].replace(/\.$/, '') : null;
}

// Pulls a provider's Rula/Headway (or other) calendar-export .ics feed and
// stores each event as a generic busy block — see ExternalCalendarFeed and
// ExternalBusyBlock for why this is safe to store (the feeds themselves
// carry no patient PHI, verified directly against real feed content Sep 29
// 2026). Mirrors RemindersCronService's shape: an hourly @Cron plus a
// directly-callable syncFeed() for the "sync now" button after someone
// just added a feed — waiting up to an hour to see it work would be a bad
// first impression, especially for a live onboarding demo.
// Rula/Headway both advertise a 1hr refresh/TTL on their feeds, but
// Charlene (Sep 30 2026) asked for 15-30 min explicitly: an hour-stale view
// of a partner's outside calendar is an hour in which an agent can
// double-book them. Polling faster than the source updates costs one cheap
// GET per feed and removes that window, so it's worth the extra requests.
const SYNC_INTERVAL_MS = 15 * 60 * 1000;

@Injectable()
export class ExternalCalendarSyncService {
  private readonly logger = new Logger(ExternalCalendarSyncService.name);

  constructor(
    @InjectRepository(ExternalCalendarFeed) private feedRepo: Repository<ExternalCalendarFeed>,
    @InjectRepository(ExternalBusyBlock) private blockRepo: Repository<ExternalBusyBlock>,
  ) {}

  // Every 15 min at :02 past, offset from reminders-cron's own */5 cadence
  // so the two don't fire on the same tick.
  @Cron('2,17,32,47 * * * *')
  async syncDueFeeds() {
    // Phase 0 audit (Oct 2 2026) caught this live in production logs: a
    // literal `null` in a TypeORM where-condition throws instead of
    // matching, so this crashed on every single run and no feed was ever
    // auto-refreshing — only the manual "sync now" button actually worked.
    // IsNull() is the correct way to match a SQL NULL here.
    const due = await this.feedRepo.find({
      where: [{ lastSyncedAt: LessThan(new Date(Date.now() - SYNC_INTERVAL_MS)) }, { lastSyncedAt: IsNull() }],
      take: 100,
    });
    for (const feed of due) {
      try {
        await this.syncFeed(feed.id);
      } catch (err: any) {
        this.logger.error(`Scheduled sync failed for feed ${feed.id}: ${err?.message}`);
      }
    }
  }

  async syncFeed(feedId: string): Promise<{ imported: number; removed: number }> {
    const feed = await this.feedRepo.findOneOrFail({ where: { id: feedId } });

    let parsed: ical.CalendarResponse;
    try {
      // node-ical's (url, options) overload is callback-style, not
      // Promise-returning — only the bare (url) call resolves to a Promise,
      // so the timeout is enforced by racing it ourselves instead.
      parsed = await Promise.race([
        ical.async.fromURL(feed.feedUrl),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Feed fetch timed out after 20s')), 20_000)),
      ]);
    } catch (err: any) {
      feed.lastSyncError = `Fetch/parse failed: ${err?.message ?? 'unknown error'}`;
      feed.lastSyncedAt = new Date();
      await this.feedRepo.save(feed);
      throw err;
    }

    const now = new Date();
    const seenUids: string[] = [];
    let imported = 0;

    for (const key of Object.keys(parsed)) {
      const component = parsed[key];
      if (!component || component.type !== 'VEVENT') continue;
      const event = component as ical.VEvent;
      const uid = event.uid ?? key;
      if (!event.start || !event.end) continue; // malformed/all-day-only entries, skip rather than guess

      seenUids.push(uid);
      const existing = await this.blockRepo.findOne({ where: { feedId: feed.id, externalUid: uid } });
      const row = existing ?? this.blockRepo.create({ providerId: feed.providerId, feedId: feed.id, source: feed.source, externalUid: uid });
      row.startAt = new Date(event.start as any);
      row.endAt = new Date(event.end as any);
      row.summary = event.summary ? String(event.summary) : 'Busy';
      const description = event.description ? String(event.description) : null;
      row.description = description;
      row.telehealthLink = extractLink(TELEHEALTH_LINK_PATTERNS, feed.source, description);
      row.managementLink = extractLink(MANAGEMENT_LINK_PATTERNS, feed.source, description);
      row.location = event.location ? String(event.location) : null;
      row.lastSeenAt = now;
      await this.blockRepo.save(row);
      imported++;
    }

    // Prune blocks no longer present on the source calendar (cancelled/moved
    // appointments) — same "computed fresh" instinct as everything else in
    // this codebase, just applied to an upstream sync instead of a live query.
    const stale = await this.blockRepo.find({ where: { feedId: feed.id } });
    const toRemove = stale.filter((b) => !seenUids.includes(b.externalUid));
    let removed = 0;
    if (toRemove.length) {
      await this.blockRepo.remove(toRemove);
      removed = toRemove.length;
    }

    feed.lastSyncedAt = now;
    feed.lastSyncError = null;
    await this.feedRepo.save(feed);

    return { imported, removed };
  }
}
