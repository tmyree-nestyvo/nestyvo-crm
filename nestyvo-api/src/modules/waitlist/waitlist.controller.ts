import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { IsString, IsOptional, IsEnum, IsArray, IsInt } from 'class-validator';
import { JwtAuthGuard } from '../../auth/auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ALL_STAFF, PROVIDER_ONLY } from '../../auth/role-groups';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../database/entities/user.entity';
import { WaitlistType } from '../../database/entities/waitlist-entry.entity';
import { WaitlistService } from './waitlist.service';

class AddWaitlistEntryDto {
  @IsString() patientId: string;
  @IsOptional() @IsString() providerId?: string;
  @IsEnum(WaitlistType) waitlistType: WaitlistType;
  @IsOptional() @IsArray() @IsInt({ each: true }) preferredDays?: number[];
  @IsOptional() preferredTimes?: Record<string, boolean>;
  @IsOptional() @IsString() notes?: string;
  // Charlene, Oct 5 2026 — "Select the applicable appointment type/tag
  // they are waiting for." The column already existed on WaitlistEntry
  // (and was already read back for display) but nothing ever wrote it —
  // this was the missing piece.
  @IsOptional() @IsString() appointmentTypeId?: string;
}

@Controller('waitlist')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WaitlistController {
  constructor(private waitlistService: WaitlistService) {}

  @Get('mine')
  @Roles(...PROVIDER_ONLY)
  getMyWaitlist(@CurrentUser() user: User) {
    return this.waitlistService.getForProvider(user);
  }

  @Post()
  @Roles(...ALL_STAFF)
  addEntry(@Body() dto: AddWaitlistEntryDto, @CurrentUser() user: User) {
    return this.waitlistService.addEntry(dto, user);
  }

  // Charlene, Oct 5 2026 — "Remove them from Waitlist" had no route at
  // all before this, on either the provider or the agent/admin side.
  // ALL_STAFF + PROVIDER_ONLY, same as addEntry — ownership (a provider
  // can only remove their own, staff follow the usual practice scoping)
  // is enforced in the service, not just by who can reach the route.
  @Delete(':id')
  @Roles(...ALL_STAFF)
  removeEntry(@Param('id') id: string, @CurrentUser() user: User) {
    return this.waitlistService.removeEntry(id, user);
  }
}
