import { Controller, Post, Body, Get, Headers, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../database/entities/user.entity';
import { Public } from './decorators/public.decorator';
import { JwtAuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './decorators/roles.decorator';
import { ADMIN_ONLY } from './role-groups';

// Intended as a dev-only bypass (real Cognito is still unconfigured in
// production as of Sep 24 2026 — see [[project_decisions]]), gated behind
// DEV_AUTH_BYPASS=true. Fixed same day two real holes found while this
// controller was live in *production* (Railway has DEV_AUTH_BYPASS=true
// set, no Cognito vars configured at all):
//   1. mockLogin used to accept an arbitrary `role` in the request body and
//      auto-created a User row for ANY email. Auto-create removed — login
//      only works for a row that already exists, role always comes from
//      that stored row, never from the request.
//   2. The JWT signing secret was a literal string checked into source
//      control. Moved to JWT_SECRET, required at boot (see auth.module.ts).
//
// Third hole, closed Sep 30 2026 now that PasswordAuthController exists as
// the real, shipped login mechanism: this endpoint still only required
// knowing a valid user's email — zero credentials — which is exactly the
// "logins don't automatically log in for anybody" gap Charlene flagged.
// DEV_AUTH_BYPASS itself has to stay true (it also selects which JWT
// *verification* strategy the whole server runs on — see auth.module.ts —
// and real Cognito still isn't provisioned, so flipping it off would break
// every login, not just this one), so the fix is narrower: both routes here
// now also require an `x-dev-secret` header matching DEV_LOGIN_SECRET, a
// separate env var known only to Troy/me, set directly on Railway, never
// committed. No var set → always 401, fails closed. This is now purely a
// verification/emergency-access tool, not a path the shipped app's UI
// exposes at all (see login.tsx).
@Controller('dev')
export class DevAuthController {
  constructor(
    private jwtService: JwtService,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  private assertDevSecret(provided: string | undefined) {
    const expected = process.env.DEV_LOGIN_SECRET;
    if (!expected || !provided || provided !== expected) {
      throw new UnauthorizedException('Invalid or missing x-dev-secret header.');
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ADMIN_ONLY)
  @Get('users')
  async listUsers(@Headers('x-dev-secret') devSecret?: string) {
    this.assertDevSecret(devSecret);
    return this.userRepo.find({ select: { id: true, email: true, role: true, firstName: true, lastName: true } });
  }

  @Public()
  @Post('login')
  async mockLogin(@Body() body: { email: string }, @Headers('x-dev-secret') devSecret?: string) {
    this.assertDevSecret(devSecret);

    const user = await this.userRepo.findOne({ where: { email: body.email } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('No account found for that email.');
    }

    const token = this.jwtService.sign({
      sub: user.cognitoId,
      email: user.email,
    });

    return { token, user: { id: user.id, email: user.email, role: user.role } };
  }
}
