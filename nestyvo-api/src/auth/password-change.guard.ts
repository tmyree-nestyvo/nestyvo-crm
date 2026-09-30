import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { ALLOW_PASSWORD_CHANGE_KEY } from './decorators/allow-password-change.decorator';
import { User } from '../database/entities/user.entity';

// Real enforcement behind the temp-password flow — not just a client-side
// redirect. A login created or reset by an admin sets mustChangePassword;
// while that's true, every route except login itself and the change-
// password endpoint 403s with a message the frontend recognizes and routes
// on, so a temp password can't be used to just start using the app.
//
// Deliberately re-checks the database on every request rather than trusting
// a JWT claim — mustChangePassword is cleared the moment a real password is
// set, and a claim baked into the token at login time would keep blocking
// (or keep allowing) based on stale state until the token's own 8h expiry.
export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';

@Injectable()
export class PasswordChangeGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_PASSWORD_CHANGE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed) return true;

    const request = context.switchToHttp().getRequest();
    const cognitoUser = request.user;
    if (!cognitoUser) return true; // no authenticated user on this request — not this guard's job

    // Reuse RolesGuard's lookup when it already ran and found the row —
    // avoids a duplicate query on the common case of a @Roles()-guarded route.
    const user: User =
      request.dbUser ?? (await this.userRepo.findOne({ where: { cognitoId: cognitoUser.cognitoId } }));
    if (!user) return true; // let RolesGuard/downstream handlers be the ones to reject an unknown user

    if (user.mustChangePassword) {
      throw new ForbiddenException(PASSWORD_CHANGE_REQUIRED);
    }
    return true;
  }
}
