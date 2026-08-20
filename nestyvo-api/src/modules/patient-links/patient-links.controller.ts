import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User, UserRole } from '../../database/entities/user.entity';
import { PatientLinksService } from './patient-links.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMINISTRATOR)
@Controller()
export class PatientLinksController {
  constructor(private service: PatientLinksService) {}

  @Get('patients/:id/links')
  listLinks(@Param('id') id: string) {
    return this.service.listLinks(id);
  }

  @Get('patients/:id/link-suggestions')
  suggestMatches(@Param('id') id: string) {
    return this.service.suggestMatches(id);
  }

  @Post('patient-links')
  create(@Body() body: { patientAId: string; patientBId: string; notes?: string }, @CurrentUser() user: User) {
    return this.service.createLink(body.patientAId, body.patientBId, body.notes, user);
  }

  @Delete('patient-links/:id')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.service.removeLink(id, user);
  }
}
