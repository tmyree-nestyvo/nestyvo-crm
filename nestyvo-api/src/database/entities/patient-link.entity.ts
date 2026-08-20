import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Unique } from 'typeorm';
import { Patient } from './patient.entity';
import { User } from './user.entity';

@Entity('patient_links')
@Unique(['patientAId', 'patientBId'])
export class PatientLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  patientAId: string;

  @ManyToOne(() => Patient)
  @JoinColumn({ name: 'patientAId' })
  patientA: Patient;

  @Column()
  patientBId: string;

  @ManyToOne(() => Patient)
  @JoinColumn({ name: 'patientBId' })
  patientB: Patient;

  @Column({ nullable: true })
  linkedBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'linkedBy' })
  linkedByUser: User;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;
}
