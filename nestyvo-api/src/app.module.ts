import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { AgentModule } from './agent/agent.module';
import { UsersModule } from './modules/users/users.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { PatientsModule } from './modules/patients/patients.module';
import { WaitlistModule } from './modules/waitlist/waitlist.module';
import { JwtAuthGuard } from './auth/auth.guard';
import { RolesGuard } from './auth/roles.guard';

// Entities
import { Practice } from './database/entities/practice.entity';
import { User } from './database/entities/user.entity';
import { Provider } from './database/entities/provider.entity';
import { ProviderAppointmentType } from './database/entities/provider-appointment-type.entity';
import { ProviderAvailability } from './database/entities/provider-availability.entity';
import { ProviderBlock } from './database/entities/provider-block.entity';
import { Patient } from './database/entities/patient.entity';
import { Appointment } from './database/entities/appointment.entity';
import { WaitlistEntry } from './database/entities/waitlist-entry.entity';
import { FillOpportunity } from './database/entities/fill-opportunity.entity';
import { OutreachQueue } from './database/entities/outreach-queue.entity';
import { AuditLog } from './database/entities/audit-log.entity';
import { AgentProviderAssignment } from './database/entities/agent-provider-assignment.entity';
import { CallbackRequest } from './database/entities/callback-request.entity';

const ALL_ENTITIES = [
  Practice,
  User,
  Provider,
  ProviderAppointmentType,
  ProviderAvailability,
  ProviderBlock,
  Patient,
  Appointment,
  WaitlistEntry,
  FillOpportunity,
  OutreachQueue,
  AuditLog,
  AgentProviderAssignment,
  CallbackRequest,
];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: [`.env.${process.env.NODE_ENV || 'development'}`, '.env'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('database.host'),
        port: config.get<number>('database.port'),
        database: config.get('database.name'),
        username: config.get('database.user'),
        password: config.get('database.password'),
        ssl: config.get<boolean>('database.ssl') ? { rejectUnauthorized: true } : false,
        entities: ALL_ENTITIES,
        synchronize: config.get('nodeEnv') === 'development',
        logging: config.get('nodeEnv') === 'development',
      }),
      inject: [ConfigService],
    }),
    // RolesGuard (APP_GUARD) needs User repo — register it here
    TypeOrmModule.forFeature([User]),
    AuthModule,
    AgentModule,
    UsersModule,
    DashboardModule,
    ProvidersModule,
    PatientsModule,
    WaitlistModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
