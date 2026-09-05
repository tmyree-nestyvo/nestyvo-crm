import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Provider } from '../../database/entities/provider.entity';
import { Appointment } from '../../database/entities/appointment.entity';
import { CalendarController } from './calendar.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Provider, Appointment])],
  controllers: [CalendarController],
})
export class CalendarModule {}
