import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User, UserRole } from '../../database/entities/user.entity';
import { WaitlistService } from './waitlist.service';

@Controller('waitlist')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WaitlistController {
  constructor(private waitlistService: WaitlistService) {}

  @Get('mine')
  @Roles(UserRole.PROVIDER)
  getMyWaitlist(@CurrentUser() user: User) {
    return this.waitlistService.getForProvider(user);
  }
}
