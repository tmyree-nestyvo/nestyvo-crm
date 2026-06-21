import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Provider } from './provider.entity';

export enum AppointmentCategory {
  NEW_PATIENT = 'new_patient',
  FOLLOWUP = 'followup',
  URGENT = 'urgent',
  OTHER = 'other',
}

@Entity('provider_appointment_types')
export class ProviderAppointmentType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  providerId: string;

  @ManyToOne(() => Provider)
  @JoinColumn({ name: 'providerId' })
  provider: Provider;

  @Column()
  name: string;

  @Column()
  durationMin: number;

  @Column({ type: 'enum', enum: AppointmentCategory, default: AppointmentCategory.FOLLOWUP })
  category: AppointmentCategory;

  @Column({ default: true })
  isActive: boolean;
}
