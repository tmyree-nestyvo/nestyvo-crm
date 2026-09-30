import { Controller, Get, Post, Delete, Param, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { IsEnum, IsString, IsOptional, IsUrl } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../../auth/auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { OFFICE_STAFF } from '../../auth/role-groups';
import { ExternalCalendarFeed, ExternalCalendarSource } from '../../database/entities/external-calendar-feed.entity';
import { ExternalCalendarSyncService } from './external-calendar-sync.service';

// Widened from PRACTICE_MANAGEMENT to OFFICE_STAFF Sep 30 2026 (Charlene,
// agent parity — "adjust hours and block times" was read to include this,
// the other half of "keep a partner's calendar accurate"). A provider
// self-service path (mirroring the self/recurring-block pattern in
// providers.controller.ts) is a natural follow-up once a provider wants to
// paste in their own link without going through the office, not built now.
//
// Pre-existing gap, not introduced or worsened by this change: unlike
// providers.controller.ts's other routes, these never call an
// assertCanManage-style practice-ownership check at all — any OFFICE_STAFF
// caller can already read/add/sync/delete any provider's feeds regardless
// of practice. Fine for SCHEDULING_AGENT (meant to be cross-practice
// everywhere) but means PRACTICE_MANAGER was never actually confined to
// their own practice here either. Low severity (busy-block metadata only,
// no PHI) — flagged rather than silently fixed while touching this file
// for an unrelated reason.
class AddFeedDto {
  @IsEnum(ExternalCalendarSource) source: ExternalCalendarSource;
  @IsUrl({ require_tld: false }) feedUrl: string;
  @IsOptional() @IsString() label?: string;
}

@Controller('providers/:providerId/external-calendars')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...OFFICE_STAFF)
export class ExternalCalendarsController {
  constructor(
    @InjectRepository(ExternalCalendarFeed) private feedRepo: Repository<ExternalCalendarFeed>,
    private syncService: ExternalCalendarSyncService,
  ) {}

  @Get()
  async list(@Param('providerId') providerId: string) {
    return this.feedRepo.find({ where: { providerId }, order: { createdAt: 'ASC' } });
  }

  @Post()
  async add(@Param('providerId') providerId: string, @Body() dto: AddFeedDto) {
    const feed = this.feedRepo.create({ providerId, source: dto.source, feedUrl: dto.feedUrl, label: dto.label });
    await this.feedRepo.save(feed);
    // Sync immediately rather than making them wait up to an hour for the
    // cron — this is exactly the moment (right after pasting the link in,
    // often live during an onboarding call) where seeing it work matters.
    try {
      await this.syncService.syncFeed(feed.id);
    } catch {
      // Swallow here — the feed is saved either way, and lastSyncError on
      // the row already carries the reason; the caller can see it in the
      // list response and retry via the sync endpoint below.
    }
    return this.feedRepo.findOneOrFail({ where: { id: feed.id } });
  }

  @Post(':feedId/sync')
  async sync(@Param('providerId') providerId: string, @Param('feedId') feedId: string) {
    const feed = await this.feedRepo.findOne({ where: { id: feedId, providerId } });
    if (!feed) throw new BadRequestException('Feed not found for this provider');
    try {
      const result = await this.syncService.syncFeed(feedId);
      return { ...result, feed: await this.feedRepo.findOneOrFail({ where: { id: feedId } }) };
    } catch (err: any) {
      // syncFeed already persisted lastSyncError on the feed row — surface
      // it as a normal 400 instead of a raw 500 so the mobile UI can just
      // show the message.
      throw new BadRequestException(err?.message ?? 'Sync failed');
    }
  }

  @Delete(':feedId')
  async remove(@Param('providerId') providerId: string, @Param('feedId') feedId: string) {
    const feed = await this.feedRepo.findOne({ where: { id: feedId, providerId } });
    if (!feed) throw new BadRequestException('Feed not found for this provider');
    await this.feedRepo.remove(feed); // cascades to external_busy_blocks
    return { success: true };
  }
}
