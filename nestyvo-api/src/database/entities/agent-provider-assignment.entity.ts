import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { Provider } from './provider.entity';

@Entity('agent_provider_assignments')
export class AgentProviderAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  agentUserId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'agentUserId' })
  agent: User;

  @Column()
  providerId: string;

  @ManyToOne(() => Provider)
  @JoinColumn({ name: 'providerId' })
  provider: Provider;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  assignedAt: Date;
}
