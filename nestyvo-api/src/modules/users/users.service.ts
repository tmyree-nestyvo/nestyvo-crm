import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../../database/entities/user.entity';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private userRepo: Repository<User>) {}

  async findByCognitoId(cognitoId: string): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { cognitoId },
      relations: { practice: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /**
   * The first ever admin-controlled path for creating a login — previously
   * the only way a User row came into existence was the seed script (or,
   * until Sep 24 2026, an unauthenticated dev-login auto-create hole, now
   * closed — see dev-auth.controller.ts). Used by partner onboarding
   * (provider logins) and directly for staff hires (agent logins).
   *
   * cognitoId is synthesized as `dev-${email}` — matching the exact
   * convention seed.ts already uses — because real AWS Cognito is not
   * configured in production at all yet (DEV_AUTH_BYPASS=true is the only
   * working auth path today). This is the intentional, sanctioned
   * replacement for that removed auto-create behavior, not a workaround:
   * role is always whatever the caller (an ADMIN_ONLY-gated endpoint)
   * explicitly passes, never inferred from anything a new user submits
   * themselves. Swap to real Cognito's AdminCreateUser API later without
   * changing this method's signature.
   */
  async create(input: {
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    practiceId?: string | null;
    phone?: string;
  }): Promise<User> {
    const existing = await this.userRepo.findOne({ where: { email: input.email } });
    if (existing) throw new ConflictException('A user with this email already exists.');

    const user = this.userRepo.create({
      cognitoId: `dev-${input.email}`,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      practiceId: input.practiceId ?? undefined,
      phone: input.phone,
      isActive: true,
    });
    return this.userRepo.save(user);
  }
}
