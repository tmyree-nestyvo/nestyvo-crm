import { Controller, Get, Header, NotFoundException, Param } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { Public } from '../../auth/decorators/public.decorator';
import { Provider } from '../../database/entities/provider.entity';
import { Appointment, AppointmentStatus } from '../../database/entities/appointment.entity';

function icsEscape(text: string): string {
  return text.replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
}

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

// Public iCal subscription feed (Sep 5 2026 ask) — Apple/Google Calendar
// "Add by URL" can't do a login flow, so this route is unauthenticated and
// protected only by the provider's own unguessable calendarFeedToken (see
// provider.entity.ts). Deliberately no patient PHI in the event body —
// third-party calendar apps aren't covered by any BAA, so events stay
// generic ("Nestyvo — booked") rather than carrying a client's name.
@Controller('calendar')
export class CalendarController {
  constructor(
    @InjectRepository(Provider) private providerRepo: Repository<Provider>,
    @InjectRepository(Appointment) private appointmentRepo: Repository<Appointment>,
  ) {}

  @Public()
  @Get('feed/:token.ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  async feed(@Param('token') token: string): Promise<string> {
    const provider = await this.providerRepo.findOne({ where: { calendarFeedToken: token } });
    if (!provider) throw new NotFoundException('Feed not found');

    const start = new Date();
    start.setDate(start.getDate() - 7);
    const end = new Date();
    end.setDate(end.getDate() + 90);

    const appointments = await this.appointmentRepo.find({
      where: {
        providerId: provider.id,
        startAt: Between(start, end),
        status: In([AppointmentStatus.SCHEDULED, AppointmentStatus.COMPLETED]),
      },
      order: { startAt: 'ASC' },
    });

    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Nestyvo//Provider Schedule//EN',
      'CALSCALE:GREGORIAN',
      `X-WR-CALNAME:${icsEscape(`Nestyvo — ${provider.firstName} ${provider.lastName}`)}`,
      'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
      'X-PUBLISHED-TTL:PT1H',
    ];

    for (const a of appointments) {
      lines.push(
        'BEGIN:VEVENT',
        `UID:${a.id}@nestyvo.com`,
        `DTSTAMP:${icsDate(new Date())}`,
        `DTSTART:${icsDate(new Date(a.startAt))}`,
        `DTEND:${icsDate(new Date(a.endAt))}`,
        `SUMMARY:${icsEscape('Nestyvo — booked')}`,
        'END:VEVENT',
      );
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }
}
