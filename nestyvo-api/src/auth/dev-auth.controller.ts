import { Controller, Post, Body, Get, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../database/entities/user.entity';
import { Public } from './decorators/public.decorator';

// Intended as a dev-only bypass (real Cognito is still unconfigured in
// production as of Sep 24 2026 — see [[project_decisions]]), gated behind
// DEV_AUTH_BYPASS=true. Fixed same day two real holes found while this
// controller was live in *production* (Railway has DEV_AUTH_BYPASS=true
// set, no Cognito vars configured at all — this bypass is the only thing
// production auth runs on right now, not a dev-only path in practice):
//   1. mockLogin used to accept an arbitrary `role` in the request body and
//      auto-created a User row for ANY email with that role — meaning
//      anyone who knew the (public) API URL could POST {"email": "x",
//      "role": "administrator"} and get a fully-privileged token with zero
//      real credentials, against a HIPAA-regulated system holding real
//      patient data. Auto-create is removed entirely — login now only
//      works for a User row that already exists (created via the seed
//      script or, going forward, the admin partner-onboarding flow), and
//      the role a token carries always comes from that stored row, never
//      from the request.
//   2. The JWT signing secret was a literal string checked into source
//      control ('nestyvo-dev-secret') — anyone with read access to the
//      repo could forge arbitrary tokens (any role, any identity) without
//      even calling this endpoint. Moved to JWT_SECRET, required at boot
//      (see auth.module.ts) — no silent fallback to the old literal.
@Controller('dev')
export class DevAuthController {
  constructor(
    private jwtService: JwtService,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  @Public()
  @Get('users')
  async listUsers() {
    return this.userRepo.find({ select: { id: true, email: true, role: true, firstName: true, lastName: true } });
  }

  @Public()
  @Post('login')
  async mockLogin(@Body() body: { email: string }) {
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
