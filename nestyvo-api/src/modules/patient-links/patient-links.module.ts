import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PatientLinksService } from './patient-links.service';
import { PatientLinksController } from './patient-links.controller';
import { PatientLink } from '../../database/entities/patient-link.entity';
import { Patient } from '../../database/entities/patient.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { User } from '../../database/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PatientLink, Patient, AuditLog, User])],
  providers: [PatientLinksService],
  controllers: [PatientLinksController],
})
export class PatientLinksModule {}
