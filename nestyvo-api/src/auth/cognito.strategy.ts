import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CognitoStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    const region = configService.get<string>('cognito.region');
    const userPoolId = configService.get<string>('cognito.userPoolId');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`,
      }),
      algorithms: ['RS256'],
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
