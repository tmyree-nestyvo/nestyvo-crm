import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Practice } from './practice.entity';
import { User } from './user.entity';

export enum ProviderStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  VACATION = 'vacation',
}

@Entity('providers')
export class Provider {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  practiceId: string;

  @ManyToOne(() => Practice)
  @JoinColumn({ name: 'practiceId' })
  practice: Practice;

  @Column({ nullable: true })
  userId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  credentials: string;

  @Column({ nullable: true })
  specialty: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  officeLocation: string;

  @Column({ default: false })
  isVirtual: boolean;

  @Column({ default: true })
  isInPerson: boolean;

  @Column({ type: 'enum', enum: ProviderStatus, default: ProviderStatus.ACTIVE })
  status: ProviderStatus;

  @Column({ nullable: true })
  newPatientCapacity: number;

  @Column({ nullable: true })
  followupCapacity: number;

  @Column({ type: 'jsonb', nullable: true })
  schedulingPreferences: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
