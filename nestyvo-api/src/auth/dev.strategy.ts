import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

// Used only when DEV_AUTH_BYPASS=true — signs tokens with a local secret
// so the app runs without a real Cognito pool configured.
@Injectable()
export class DevStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: 'nestyvo-dev-secret',
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
