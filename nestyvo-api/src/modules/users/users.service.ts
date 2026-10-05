import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../../database/entities/user.entity';
import { hashPassword, generateTempPassword } from '../../auth/password.util';

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

  // Charlene, Oct 5 2026 — Provider deactivation disables the linked login
  // (and reactivation restores it) via this, reusing RolesGuard's existing
  // real-time isActive recheck rather than a second revocation mechanism.
  async setActive(userId: string, isActive: boolean): Promise<void> {
    await this.userRepo.update({ id: userId }, { isActive });
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
    /** Admin can set one directly; otherwise a temp password is generated. */
    initialPassword?: string;
  }): Promise<{ user: User; tempPassword: string | null }> {
    const existing = await this.userRepo.findOne({ where: { email: input.email } });
    if (existing) throw new ConflictException('A user with this email already exists.');

    // A generated password is always a "temp" one (mustChangePassword=true,
    // handed back once so the admin can relay it — see password.util.ts);
    // an admin-supplied one is trusted as already-communicated and doesn't
    // force a change, matching how the admin would set it up in person.
    const generated = !input.initialPassword;
    const plainPassword = input.initialPassword ?? generateTempPassword();

    const user = this.userRepo.create({
      cognitoId: `dev-${input.email}`,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      practiceId: input.practiceId ?? undefined,
      phone: input.phone,
      isActive: true,
      passwordHash: await hashPassword(plainPassword),
      mustChangePassword: generated,
    });
    const saved = await this.userRepo.save(user);
    return { user: saved, tempPassword: generated ? plainPassword : null };
  }

  /**
   * Admin-only password reset — for a login that's stuck (forgotten temp
   * password, needs re-issuing) or, right now, for migrating the handful of
   * accounts that existed before real password auth did (see the Sep 30
   * 2026 migration note in charlene_requirements memory). Always generates
   * a fresh temp password and forces a change on next sign-in — an admin
   * resetting someone else's password should never silently know their
   * real one afterward.
   */
  async resetPassword(userId: string): Promise<{ user: User; tempPassword: string }> {
    const user = await this.findById(userId);
    const tempPassword = generateTempPassword();
    user.passwordHash = await hashPassword(tempPassword);
    user.mustChangePassword = true;
    const saved = await this.userRepo.save(user);
    return { user: saved, tempPassword };
  }
}
