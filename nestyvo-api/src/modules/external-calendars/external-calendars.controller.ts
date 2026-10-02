import { Controller, Get, Post, Delete, Param, Body, UseGuards, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { IsEnum, IsString, IsOptional, IsUrl } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../../auth/auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { OFFICE_STAFF } from '../../auth/role-groups';
import { User, UserRole } from '../../database/entities/user.entity';
import { Provider } from '../../database/entities/provider.entity';
import { ExternalCalendarFeed, ExternalCalendarSource } from '../../database/entities/external-calendar-feed.entity';
import { ExternalCalendarSyncService } from './external-calendar-sync.service';

// Widened from PRACTICE_MANAGEMENT to OFFICE_STAFF Sep 30 2026 (Charlene,
// agent parity — "adjust hours and block times" was read to include this,
// the other half of "keep a partner's calendar accurate"). A provider
// self-service path (mirroring the self/recurring-block pattern in
// providers.controller.ts) is a natural follow-up once a provider wants to
// paste in their own link without going through the office, not built now.
//
// Practice-ownership check added Oct 2 2026, confirmed missing during a
// deep QA pass with the first-ever real practice_manager test account:
// every route here trusted the :providerId in the URL with no check whether
// it belonged to the caller's own practice — fine for SCHEDULING_AGENT
// (meant to be cross-practice everywhere) but PRACTICE_MANAGER could read/
// add/sync/delete another practice's provider's calendar feeds. Low
// severity (busy-block metadata only, no PHI, already flagged in a
// since-removed version of this comment) but a real gap, fixed properly
// rather than left flagged a second time.
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
    @InjectRepository(Provider) private providerRepo: Repository<Provider>,
    private syncService: ExternalCalendarSyncService,
  ) {}

  private async assertCanAccess(providerId: string, user: User): Promise<void> {
    if (user.role === UserRole.ADMINISTRATOR || user.role === UserRole.SCHEDULING_AGENT) return;
    const provider = await this.providerRepo.findOne({ where: { id: providerId } });
    if (!provider) throw new NotFoundException('Provider not found');
    if (provider.practiceId !== user.practiceId) throw new ForbiddenException('Not your practice');
  }

  @Get()
  async list(@Param('providerId') providerId: string, @CurrentUser() user: User) {
    await this.assertCanAccess(providerId, user);
    return this.feedRepo.find({ where: { providerId }, order: { createdAt: 'ASC' } });
  }

  @Post()
  async add(@Param('providerId') providerId: string, @Body() dto: AddFeedDto, @CurrentUser() user: User) {
    await this.assertCanAccess(providerId, user);
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
  async sync(@Param('providerId') providerId: string, @Param('feedId') feedId: string, @CurrentUser() user: User) {
    await this.assertCanAccess(providerId, user);
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
  async remove(@Param('providerId') providerId: string, @Param('feedId') feedId: string, @CurrentUser() user: User) {
    await this.assertCanAccess(providerId, user);
    const feed = await this.feedRepo.findOne({ where: { id: feedId, providerId } });
    if (!feed) throw new BadRequestException('Feed not found for this provider');
    await this.feedRepo.remove(feed); // cascades to external_busy_blocks
    return { success: true };
  }
}
