import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Provider } from './provider.entity';
import { User } from './user.entity';

export enum BlockType {
  VACATION = 'vacation',
  PERSONAL = 'personal',
  ADMINISTRATIVE = 'administrative',
  OTHER = 'other',
}

@Entity('provider_blocks')
export class ProviderBlock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  providerId: string;

  @ManyToOne(() => Provider)
  @JoinColumn({ name: 'providerId' })
  provider: Provider;

  @Column({ type: 'timestamptz' })
  startAt: Date;

  @Column({ type: 'timestamptz' })
  endAt: Date;

  @Column({ type: 'enum', enum: BlockType, default: BlockType.OTHER })
  blockType: BlockType;

  @Column({ nullable: true })
  reason: string;

  @Column({ nullable: true })
  createdBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'createdBy' })
  createdByUser: User;

  @CreateDateColumn()
  createdAt: Date;
}
