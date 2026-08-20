import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { ReminderChannel } from '../../database/entities/appointment-reminder.entity';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(@InjectRepository(AuditLog) private auditRepo: Repository<AuditLog>) {}

  // Stub: logs + audits instead of calling Twilio/email. The `twilio` package and its
  // config (src/config/configuration.ts) are already present but unwired — swap the
  // logger call below for a real send without touching any caller of this method.
  async send(params: {
    to: string;
    body: string;
    channel: ReminderChannel;
    appointmentId: string;
    reminderId: string;
    reminderType: string;
  }) {
    this.logger.log(`[${params.channel.toUpperCase()} STUB] to ${params.to}: ${params.body}`);
    await this.auditRepo.save(
      this.auditRepo.create({
        userId: null,
        action: 'reminder.sent',
        resourceType: 'appointment_reminder',
        resourceId: params.reminderId,
        newValues: {
          channel: params.channel,
          type: params.reminderType,
          appointmentId: params.appointmentId,
          to: params.to,
        },
      }),
    );
  }
}
