import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Provider } from './provider.entity';

@Entity('provider_availability')
export class ProviderAvailability {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  providerId: string;

  @ManyToOne(() => Provider)
  @JoinColumn({ name: 'providerId' })
  provider: Provider;

  @Column({ type: 'smallint' })
  dayOfWeek: number; // 0=Sun, 6=Sat

  @Column({ type: 'time' })
  startTime: string;

  @Column({ type: 'time' })
  endTime: string;

  @Column({ type: 'date', nullable: true })
  effectiveFrom: string;

  @Column({ type: 'date', nullable: true })
  effectiveUntil: string;

  @Column({ default: true })
  isActive: boolean;
}
