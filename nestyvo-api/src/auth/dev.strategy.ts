import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

// Used only when DEV_AUTH_BYPASS=true — verifies tokens signed with
// JWT_SECRET so the app runs without a real Cognito pool configured. See
// dev-auth.controller.ts for why this must NOT be a hardcoded literal.
@Injectable()
export class DevStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET must be set when DEV_AUTH_BYPASS=true — refusing to start with no secret configured.');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: any) {
    return {
      cognitoId: payload.sub,
      email: payload.email,
      groups: payload['cognito:groups'] || [],
    };
  }
}
