import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
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
}
