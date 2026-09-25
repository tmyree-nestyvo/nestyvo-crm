import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ADMIN_AND_AGENT } from '../../auth/role-groups';
import { PracticesService } from './practices.service';

@Controller('practices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PracticesController {
  constructor(private practicesService: PracticesService) {}

  @Get()
  @Roles(...ADMIN_AND_AGENT)
  list() {
    return this.practicesService.list();
  }
}
