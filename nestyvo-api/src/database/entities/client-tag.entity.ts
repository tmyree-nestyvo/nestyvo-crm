import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Practice } from './practice.entity';

@Entity('client_tags')
export class ClientTag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  practiceId: string;

  @ManyToOne(() => Practice)
  @JoinColumn({ name: 'practiceId' })
  practice: Practice;

  @Column()
  name: string;

  @Column()
  blockMinutes: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
